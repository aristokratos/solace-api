import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

export class FeedbackDto {
  @IsString() @Matches(/^[a-z0-9_.-]{1,64}$/) toolSlot: string;
  @IsInt() @Min(1) @Max(5) rating: number;
}

/** "Did this help?" (PRD F-11). Feeds the helpfulness metric; no free text is collected. */
@Controller('v1/feedback')
export class FeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(201)
  async create(@CurrentUser() u: AuthUser, @Body() dto: FeedbackDto) {
    await this.prisma.feedback.create({ data: { userId: u.id, toolSlot: dto.toolSlot, rating: dto.rating } });
    return { status: 'thanks' };
  }
}

@Module({ controllers: [FeedbackController] })
export class FeedbackModule {}
