import { Controller, Get, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) { }

  @ApiOperation({ summary: 'Get all inventory items' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Request() req) {
    const start = Date.now();
    if (req.user.role !== 'ADMIN') {
      throw new UnauthorizedException('Insufficient permissions');
    }

    const inventory = await this.inventoryService.findAll();
    console.log('Inventory fetch time:', Date.now() - start, 'ms');
    return inventory;
  }
}