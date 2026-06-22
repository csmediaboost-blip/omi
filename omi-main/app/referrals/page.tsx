'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Users, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

const mockReferrals = [
  {
    id: '1',
    email: 'john@example.com',
    name: 'John Smith',
    joinDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    earnings: 50,
    status: 'active',
  },
  {
    id: '2',
    email: 'jane@example.com',
    name: 'Jane Doe',
    joinDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    earnings: 75,
    status: 'active',
  },
  {
    id: '3',
    email: 'bob@example.com',
    name: 'Bob Johnson',
    joinDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    earnings: 100,
    status: 'active',
  },
];

export default function ReferralsPage() {
  const { currentUser, userProfile, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/auth/signin');
    }
  }, [currentUser, loading, router]);

  const handleCopyLink = () => {
    const referralLink = `${window.location.origin}?ref=${userProfile?.referralCode}`;
    navigator.clipboard.writeText(referralLink);
    toast.success('Referral link copied to clipboard!');
  };

  if (!mounted || loading || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background dark">
        <Spinner />
      </div>
    );
  }

  const totalReferralEarnings = mockReferrals.reduce((sum, ref) => sum + ref.earnings, 0);

  return (
    <div className="min-h-screen bg-background dark">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-foreground">
            OmniTask Pro
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">Back to Dashboard</Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold text-foreground mb-2 flex items-center gap-2">
          <Users className="w-8 h-8" />
          Referral Program
        </h1>
        <p className="text-muted-foreground mb-8">
          Earn money by inviting friends to join OmniTask Pro
        </p>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">{mockReferrals.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Active referrals</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Referral Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">${totalReferralEarnings}</p>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Next Bonus Tier</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {5 - mockReferrals.length} more
              </p>
              <p className="text-xs text-muted-foreground mt-1">To reach tier 2 ($25/referral)</p>
            </CardContent>
          </Card>
        </div>

        {/* Referral Link */}
        <Card className="mb-8 border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle>Your Referral Link</CardTitle>
            <CardDescription>Share this link with friends to earn commissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}?ref=${userProfile.referralCode}`}
                readOnly
                className="font-mono text-sm"
              />
              <Button onClick={handleCopyLink} size="icon">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Referral Tiers */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Bonus Tiers</CardTitle>
            <CardDescription>Earn more as you refer more friends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { tier: 'Tier 1', referrals: '0-4', bonus: '$10' },
                { tier: 'Tier 2', referrals: '5-9', bonus: '$25' },
                { tier: 'Tier 3', referrals: '10-24', bonus: '$50' },
                { tier: 'Tier 4', referrals: '25+', bonus: '$100' },
              ].map(tier => (
                <div key={tier.tier} className="border border-border rounded-lg p-4 text-center">
                  <p className="font-semibold text-foreground">{tier.tier}</p>
                  <p className="text-sm text-muted-foreground my-1">{tier.referrals} referrals</p>
                  <p className="text-lg font-bold text-primary">{tier.bonus}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Referral List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Referrals</CardTitle>
            <CardDescription>People you've referred to OmniTask Pro</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Your Earnings</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockReferrals.map(ref => (
                    <TableRow key={ref.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{ref.name}</TableCell>
                      <TableCell className="text-sm">{ref.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ref.joinDate.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        ${ref.earnings}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">{ref.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
