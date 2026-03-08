/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const authUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!authUser) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, authUser.password);

    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const payload = {
      userId: authUser.id,
      email: authUser.email,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
