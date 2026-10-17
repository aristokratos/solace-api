import { Global, Module } from '@nestjs/common';
import { FieldCipher } from './field-cipher.service';
import { LocalMasterKeyProvider, MasterKeyProvider } from './master-key.provider';

@Global()
@Module({
  providers: [{ provide: MasterKeyProvider, useClass: LocalMasterKeyProvider }, FieldCipher],
  exports: [MasterKeyProvider, FieldCipher],
})
export class CryptoModule {}
