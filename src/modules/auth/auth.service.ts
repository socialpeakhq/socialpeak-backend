import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dtos/CreateUser.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon from 'argon2';
import { LoginUserDto } from './dtos/LoginUser.dto';

type SelectedUser = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

const authUserSelect = {
  id: true,
  createdAt: true,
  email: true,
  full_name: true,
  has_connected_workspace: true,
  phone_number: true,
  workspace_id: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async registerUser(dto: CreateUserDto) {
    const hashedPassword = await argon.hash(dto.password);

    let user: SelectedUser;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          full_name: dto.full_name,
          password: hashedPassword,
          phone_number: dto.phone_number,
        },
        select: authUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException({
          message: 'Registration failed',
          field: 'email',
        });
      }
      throw error;
    }

    const tokens = await this.generateTokens(user);
    await this.prisma.workspace.create({
      data: {
        owner_id: user.id,
        workspace_name: '',
        created_at: new Date(),
      },
    });
    return { ...tokens, message: 'User created successfully' };
  }

  async loginUser(dto: LoginUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('Invalid Credentials');
    }

    const passwordMatch = await argon.verify(user.password, dto.password);

    if (!passwordMatch) {
      throw new BadRequestException('Invalid Credentials');
    }

    const safeUser: SelectedUser = {
      id: user.id,
      full_name: user.full_name,
      has_connected_workspace: user.has_connected_workspace,
      phone_number: user.phone_number,
      email: user.email,
      workspace_id: user.workspace_id,
      createdAt: user.createdAt,
    };

    const tokens = await this.generateTokens(safeUser);
    return { ...tokens, message: 'Login successful' };
  }

  private async generateTokens(user: SelectedUser) {
    const payload = { sub: user.id, email: user.email };

    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!jwtSecret || !jwtRefreshSecret) {
      throw new Error('JWT secret not found!');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: jwtRefreshSecret,
        expiresIn: '7d',
      }),
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { token: refreshToken },
    });

    return {
      data: user,
      access_token: accessToken,
    };
  }
}
