import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateNotesDto } from './dto/update-notes.dto';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
    constructor(private readonly notesService: NotesService) { }

    @Get()
    async getNotesByVisit(@Query('visitId') visitId: string, @Req() req) {
        return this.notesService.getNotesByVisit(visitId, req.user);
    }

    @Patch(':visitId')
    async updateNotes(@Param('visitId') visitId: string, @Body() updateNotesDto: UpdateNotesDto, @Req() req) {
        return this.notesService.updateNotes(visitId, updateNotesDto, req.user);
    }
}
