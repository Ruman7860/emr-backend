import { IsString, IsOptional } from 'class-validator';

export class UpdateNotesDto {
    @IsString()
    @IsOptional()
    notes?: string;
}
