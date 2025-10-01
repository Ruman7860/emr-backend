import { Module } from "@nestjs/common";
import { PrismaService } from "prisma/prisma.service";
import { StaffService } from "./staffs.service";
import { StaffController } from "./staffs.controller";

@Module({
    providers:[PrismaService, StaffService],
    controllers:[StaffController],
})

export class StaffModule {};