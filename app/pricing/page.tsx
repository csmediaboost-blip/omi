'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, ArrowRight } from 'lucide-react';
import { TIER_FEATURES } from '@/lib/constants';

const tiers = ['free', 'pro', 'premium', 'enterprise'] as const;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background dark">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-foreground">
            OmniTask Pro
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/auth/signin">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-foreground mb-4">Simple, Transparent Pricing</h1>
          <p className="text-xl text-muted-foreground">
            Choose the plan that fits your needs. Upgrade or downgrade at any time.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-4 gap-6">
          {tiers.map(tier => {
            const tierData = TIER_FEATURES[tier as keyof typeof TIER_FEATURES];
            const isPopular = tier === 'premium';

            return (
              <Card key={tier} className={`flex flex-col ${isPopular ? 'border-primary ring-2 ring-primary/20' : ''}`}>
                <CardHeader>
                  {isPopular && (
                    <div className="mb-2">
                      <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <CardTitle>{tierData.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">
                      ${tierData.price}
                    </span>
                    <span className="text-muted-foreground ml-2">/month</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <p className="text-sm text-muted-foreground mb-6">
                    {tierData.monthlyTaskLimit === -1 
                      ? 'Unlimited tasks' 
                      : `Up to ${tierData.monthlyTaskLimit} tasks/month`}
                  </p>

                  <ul className="space-y-3 mb-6 flex-1">
                    {tierData.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href="/auth/signup" className="w-full">
                    <Button 
                      className="w-full gap-2"
                      variant={isPopular ? 'default' : 'outline'}
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="mt-20 border-t border-border pt-20">
          <h2 className="text-3xl font-bold text-foreground mb-12 text-center">Frequently Asked Questions</h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Can I change my plan?</h3>
              <p className="text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Is there a free trial?</h3>
              <p className="text-muted-foreground">
                Yes, our Free plan is essentially a trial. You can start earning right away with no credit card required.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">What payment methods do you accept?</h3>
              <p className="text-muted-foreground">
                We accept Stripe, PayPal, Korapay, and cryptocurrency payments. Choose what works for you.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Do I need a credit card for Free plan?</h3>
              <p className="text-muted-foreground">
                No, the Free plan requires no payment information. Start earning immediately!
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Can I get a refund?</h3>
              <p className="text-muted-foreground">
                We offer a 14-day money-back guarantee for annual plans. No questions asked.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">What's included in each plan?</h3>
              <p className="text-muted-foreground">
                See the features above. Higher tiers unlock more tasks, workers, support levels, and analytics.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-20 bg-card p-12 rounded-lg border border-border text-center">
          <h3 className="text-2xl font-bold text-foreground mb-4">Ready to start earning?</h3>
          <p className="text-muted-foreground mb-6">
            Join thousands of successful workers on OmniTask Pro today.
          </p>
          <Link href="/auth/signup">
            <Button size="lg" className="gap-2">
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
