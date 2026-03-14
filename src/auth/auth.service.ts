import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dtos/CreateUser.dto';
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  // Test Function //
  createUser(data: CreateUserDto) {
    return this.prisma.user.create({ data });
  }
}
