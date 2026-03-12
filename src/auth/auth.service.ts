import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CreateUser = {
  full_name: string;
  password: string;
  email: string;
  phoneNumber: string;
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  // Test Function //
  createUser(data: CreateUser) {
    return this.prisma.user.create({ data });
  }
}
