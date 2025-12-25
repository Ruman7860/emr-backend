import { PartialType } from '@nestjs/mapped-types';
import { CreateLabTestDto } from './create-labtest.dto';

export class UpdateLabTestDto extends PartialType(CreateLabTestDto) { }
