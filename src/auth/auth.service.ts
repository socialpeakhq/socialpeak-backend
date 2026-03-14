import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dtos/CreateUser.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}
  async registerUser(dto: CreateUserDto) {
    const doesUserExist = Boolean(
      this.prisma.user.findFirst({
        where: {
          email: dto.email,
        },
      }),
    );
    if (doesUserExist) {
      throw new BadRequestException({
        message: 'User with this e-mail already exists',
        field: 'email',
      });
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = this.prisma.user.create({
      data: {
        email: dto.email,
        full_name: dto.full_name,
        password: hashedPassword,
        phone_number: dto.phone_number,
      },
    });

    return user;
  }
}
