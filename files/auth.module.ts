import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthCommands } from './auth.commands';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterModule } from '../master/master.module';

@Module({
  imports: [
    PrismaModule,
    MasterModule,
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
