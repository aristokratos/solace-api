import { Body, Controller, Delete, Get, HttpCode, Patch, Put } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ConsentDto, UpdateProfileDto } from './dto';
import { MeService } from './me.service';

@Controller('v1/me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.me.profile(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.me.update(user.id, dto);
  }

  @Put('consents')
  consent(@CurrentUser() user: AuthUser, @Body() dto: ConsentDto) {
    return this.me.setConsent(user.id, dto);
  }

  @Get('export')
  export(@CurrentUser() user: AuthUser) {
    return this.me.export(user.id);
  }

  @Delete()
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser) {
    await this.me.delete(user.id);
  }
}
