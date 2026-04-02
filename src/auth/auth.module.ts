import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MasterModule } from '../master/master.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthCommands } from './auth.commands';
import { AuthService } from './auth.service';

@Module({
  imports: [
    PrismaModule,
    MasterModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') },
      }),
    }),
  ],
  providers: [AuthService, AuthCommands],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}