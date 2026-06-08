import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, UserCredential, Prisma } from '@prisma/client';

export type UserWithCredential = User & { credential: UserCredential | null };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserWithCredential | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { credential: true },
    });
  }

  async findByPhoneNumber(
    mobileNumber: string,
  ): Promise<UserWithCredential | null> {
    const credential = await this.prisma.userCredential.findUnique({
      where: { mobileNumber },
      include: {
        user: {
          include: { credential: true },
        },
      },
    });
    return credential?.user || null;
  }

  async create(data: {
    mobileNumber: string;
    countryCode: string;
    email?: string;
    preferredLanguage?: string;
    timezone?: string;
  }): Promise<UserWithCredential> {
    return this.prisma.user.create({
      data: {
        preferredLanguage: data.preferredLanguage,
        timezone: data.timezone,
        credential: {
          create: {
            mobileNumber: data.mobileNumber,
            countryCode: data.countryCode,
            email: data.email,
          },
        },
      },
      include: {
        credential: true,
      },
    });
  }

  async update(
    id: string,
    data: Prisma.UserUpdateInput,
  ): Promise<UserWithCredential> {
    return this.prisma.user.update({
      where: { id },
      data,
      include: { credential: true },
    });
  }
}
