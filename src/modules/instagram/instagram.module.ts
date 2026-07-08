import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
