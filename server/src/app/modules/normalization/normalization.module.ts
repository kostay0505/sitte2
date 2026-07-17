import { Global, Module } from '@nestjs/common';
import { NormalizationService } from './normalization.service';

@Global()
@Module({
    providers: [NormalizationService],
    exports: [NormalizationService],
})
export class NormalizationModule {}
