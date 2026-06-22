'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpRight, ArrowDownLeft, Wallet, Plus } from 'lucide-react';
import Link from 'next/link';

const mockTransactions = [
  {
    id: '1',
    type: 'task_payment',
    amount: 150,
    description: 'Data Entry - Customer Records',
    status: 'completed',
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    type: 'withdrawal',
    amount: -500,
    description: 'Withdrawal to Bank Account',
    status: 'completed',
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    type: 'referral_bonus',
    amount: 50,
    description: 'Referral Bonus - 2 friends joined',
    status: 'completed',
    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    type: 'task_payment',
    amount: 300,
    description: 'Content Writing - Blog Posts',
    status: 'completed',
    date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '5',
    type: 'deposit',
    amount: 100,
    description: 'Deposit via Credit Card',
    status: 'completed',
    date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
  },
];

function getTransactionIcon(type: string) {
  if (type === 'withdrawal' || type === 'deposit') {
    return type === 'withdrawal' ? (
      <ArrowDownLeft className="w-5 h-5 text-red-500" />
    ) : (
      <ArrowUpRight className="w-5 h-5 text-green-500" />
    );
  }
  return <ArrowUpRight className="w-5 h-5 text-green-500" />;
}

function getTransactionColor(type: string) {
  if (type === 'withdrawal') return 'text-red-500';
  return 'text-green-500';
}

export default function WalletPage() {
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

  if (!mounted || loading || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background dark">
        <Spinner />
      </div>
    );
  }

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
        <h1 className="text-4xl font-bold text-foreground mb-2">Wallet</h1>
        <p className="text-muted-foreground mb-8">Manage your funds and view transaction history</p>

        {/* Balance Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                ${userProfile.balance.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Available to withdraw</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                ${userProfile.totalEarnings.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button size="sm" className="w-full gap-2">
                <Plus className="w-4 h-4" />
                Add Funds
              </Button>
              <Button size="sm" variant="outline" className="w-full">
                Withdraw
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>Your recent wallet transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockTransactions.map(tx => (
                    <TableRow key={tx.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getTransactionIcon(tx.type)}
                          <span className="capitalize">{tx.type.replace('_', ' ')}</span>
                        </div>
                      </TableCell>
                      <TableCell>{tx.description}</TableCell>
                      <TableCell className={`font-semibold ${getTransactionColor(tx.type)}`}>
                        {tx.amount > 0 ? '+' : ''} ${Math.abs(tx.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tx.status === 'completed' ? 'default' : 'secondary'}>
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tx.date.toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Manage your withdrawal methods</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Add payment methods to withdraw your earnings
            </p>
            <Button>Add Payment Method</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
