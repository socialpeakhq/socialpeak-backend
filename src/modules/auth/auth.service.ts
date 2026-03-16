import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dtos/CreateUser.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon from 'argon2';

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
    try {
      const hashedPassword = await argon.hash(dto.password);

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          full_name: dto.full_name,
          password: hashedPassword,
          phone_number: dto.phone_number,
        },
        select: authUserSelect,
      });

      return this.generateTokens(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException({
            message: 'Registration failed',
            field: 'email',
          });
        }
      }
    }
  }

  async generateTokens(user: SelectedUser) {
    const payload = { sub: user.id, email: user.email };
    const secret = this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new Error('Secret not found!');
    }

    const accessToken = this.jwtService.sign(payload, {
      secret: secret,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { token: refreshToken },
    });

    return {
      data: user,
      access_token: accessToken,
      message: 'User created successfully',
    };
  }
}
