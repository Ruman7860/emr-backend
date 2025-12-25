import { IsString, IsOptional, IsNumber } from 'class-validator';

export class GeneratePrescriptionPdfDto {
    @IsString()
    visitId: string;

    @IsNumber()
    @IsOptional()
    version?: number;
}
