import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MetaController } from './meta.controller';
import { MetaService } from './meta.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [MetaController],
  providers: [MetaService],
})
export class MetaModule {}
