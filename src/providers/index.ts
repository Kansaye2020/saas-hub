import { IPaymentProvider } from "./base";
import { LomoPayProvider } from "./lomopay.provider";
import { WhopProvider } from "./whop.provider";
import { StripeProvider } from "./stripe.provider";
import { ChariowProvider } from "./chariow.provider";
import { PaymentProviderType } from "../types";

export class ProviderRegistry {
  private providers: Map<PaymentProviderType, IPaymentProvider> = new Map();

  constructor() {
    this.register(new LomoPayProvider());
    this.register(new WhopProvider());
    this.register(new StripeProvider());
    this.register(new ChariowProvider());
  }

  public register(provider: IPaymentProvider) {
    this.providers.set(provider.name, provider);
  }

  public getProvider(name: PaymentProviderType): IPaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Passerelle de paiement non supportée : "${name}"`);
    }
    return provider;
  }

  public getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry = new ProviderRegistry();
