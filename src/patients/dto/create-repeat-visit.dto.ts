import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRepeatVisitDto {
    @IsString()
    @IsOptional()
    chiefComplaint?: string;

    @IsNumber()
    @Min(1)
    @IsOptional()
    registrationFee?: number;

    @IsString()
    @IsOptional()
    doctorId?: string;
}
