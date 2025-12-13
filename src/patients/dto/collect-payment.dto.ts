// dto/collect-payment.dto.ts
import { IsEnum, IsBoolean, IsNumber, IsString } from 'class-validator';
import { BillingType, PaymentMode } from '@prisma/client';

export class CollectPaymentDto {
  @IsString()
  visitId: string;

  @IsEnum(BillingType)
  billingType: BillingType;

  @IsNumber()
  amount: number;

  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @IsBoolean()
  markPaid: boolean;
}
