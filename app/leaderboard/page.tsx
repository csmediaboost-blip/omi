'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy, Medal } from 'lucide-react';
import Link from 'next/link';

const mockLeaderboard = [
  { rank: 1, name: 'Alice Chen', score: 4850, tier: 'enterprise', badge: '👑' },
  { rank: 2, name: 'Bob Wilson', score: 4620, tier: 'premium', badge: '🥇' },
  { rank: 3, name: 'Carol Martinez', score: 4390, tier: 'premium', badge: '🥈' },
  { rank: 4, name: 'David Lee', score: 4120, tier: 'pro', badge: '🥉' },
  { rank: 5, name: 'Emma Thompson', score: 3950, tier: 'pro', badge: '' },
  { rank: 6, name: 'Frank Brown', score: 3780, tier: 'pro', badge: '' },
  { rank: 7, name: 'Grace Kim', score: 3650, tier: 'free', badge: '' },
  { rank: 8, name: 'Henry Johnson', score: 3520, tier: 'free', badge: '' },
  { rank: 9, name: 'Iris Davis', score: 3390, tier: 'free', badge: '' },
  { rank: 10, name: 'Jack Miller', score: 3210, tier: 'free', badge: '' },
];

export default function LeaderboardPage() {
  const { currentUser, userProfile, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState('monthly');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/auth/signin');
    }
  }, [currentUser, loading, router]);

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background dark">
        <Spinner />
      </div>
    );
  }

  const userRank = 42; // Mock user's rank

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
          <Trophy className="w-8 h-8 text-yellow-500" />
          Leaderboard
        </h1>
        <p className="text-muted-foreground mb-8">
          See who's earning the most and compete for top rankings
        </p>

        {/* Your Position Card */}
        {userProfile && (
          <Card className="mb-8 border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Your Position</p>
                  <p className="text-2xl font-bold text-foreground">Rank #{userRank}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground mb-1">Your Score</p>
                  <p className="text-3xl font-bold text-primary">{Math.floor(Math.random() * 2000) + 1000}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Period Filter */}
        <div className="mb-6">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="alltime">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performers</CardTitle>
            <CardDescription>Ranked by total earnings this {period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'season'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Achievement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockLeaderboard.map(entry => (
                    <TableRow 
                      key={entry.rank} 
                      className={entry.rank <= 3 ? 'bg-muted/50 hover:bg-muted' : 'hover:bg-muted/50'}
                    >
                      <TableCell className="font-bold">
                        {entry.rank <= 3 ? (
                          <span className="text-lg">{entry.badge}</span>
                        ) : (
                          <span>#{entry.rank}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{entry.name}</TableCell>
                      <TableCell className="font-semibold text-primary">{entry.score.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{entry.tier}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.rank === 1 && '⭐ Champion'}
                        {entry.rank === 2 && '🎖️ Runner-up'}
                        {entry.rank === 3 && '🏅 Top 3'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Rewards Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Medal className="w-5 h-5 text-yellow-500" />
              Season Rewards
            </CardTitle>
            <CardDescription>Top 3 performers receive bonus rewards</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="border border-primary rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-yellow-500 mb-2">🥇 1st Place</p>
                <p className="text-2xl font-bold text-primary mb-1">$500</p>
                <p className="text-sm text-muted-foreground">+ Special Badge</p>
              </div>
              <div className="border border-gray-400 rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-gray-400 mb-2">🥈 2nd Place</p>
                <p className="text-2xl font-bold text-foreground mb-1">$300</p>
                <p className="text-sm text-muted-foreground">+ Special Badge</p>
              </div>
              <div className="border border-orange-600 rounded-lg p-4 text-center">
                <p className="text-xl font-bold text-orange-600 mb-2">🥉 3rd Place</p>
                <p className="text-2xl font-bold text-foreground mb-1">$100</p>
                <p className="text-sm text-muted-foreground">+ Special Badge</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
