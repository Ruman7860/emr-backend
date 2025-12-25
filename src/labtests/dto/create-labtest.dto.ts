import { IsString, IsNotEmpty } from 'class-validator';

export class CreateLabTestDto {
    @IsString()
    @IsNotEmpty()
    visitId: string;

    @IsString()
    @IsNotEmpty()
    patientId: string;

    @IsString()
    @IsNotEmpty()
    tests: string;
}
