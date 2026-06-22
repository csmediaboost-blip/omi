'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const mockTasks = [
  {
    id: '1',
    title: 'Data Entry - Customer Records',
    description: 'Enter 500 customer records into the database with validation.',
    category: 'Data Entry',
    difficulty: 'easy',
    paymentAmount: 150,
    currency: 'USD',
    status: 'open',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    applicants: 12,
  },
  {
    id: '2',
    title: 'Content Writing - Blog Posts',
    description: 'Write 5 SEO-optimized blog posts about AI and machine learning.',
    category: 'Content Writing',
    difficulty: 'medium',
    paymentAmount: 500,
    currency: 'USD',
    status: 'open',
    deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    applicants: 8,
  },
  {
    id: '3',
    title: 'Market Research - Competitor Analysis',
    description: 'Research and analyze 10 competitors in the SaaS space.',
    category: 'Research',
    difficulty: 'hard',
    paymentAmount: 1000,
    currency: 'USD',
    status: 'open',
    deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    applicants: 5,
  },
  {
    id: '4',
    title: 'Image Tagging - Product Catalog',
    description: 'Tag 1000 product images with appropriate categories and attributes.',
    category: 'Data Entry',
    difficulty: 'easy',
    paymentAmount: 200,
    currency: 'USD',
    status: 'open',
    deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    applicants: 24,
  },
];

const CATEGORIES = ['All', 'Data Entry', 'Content Writing', 'Research', 'Design', 'Development', 'Marketing'];

function getDifficultyColor(difficulty: string) {
  switch (difficulty) {
    case 'easy':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'medium':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'hard':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
}

export default function MarketplacePage() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filteredTasks, setFilteredTasks] = useState(mockTasks);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/auth/signin');
    }
  }, [currentUser, loading, router]);

  useEffect(() => {
    let filtered = mockTasks;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(task => task.category === selectedCategory);
    }

    if (searchQuery) {
      filtered = filtered.filter(task =>
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredTasks(filtered);
  }, [searchQuery, selectedCategory]);

  if (!mounted || loading) {
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
        <h1 className="text-4xl font-bold text-foreground mb-2">Task Marketplace</h1>
        <p className="text-muted-foreground mb-8">
          Browse and accept available tasks. Start earning today.
        </p>

        {/* Filters */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tasks Grid */}
        <div className="space-y-4">
          {filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-muted-foreground">No tasks found. Try adjusting your filters.</p>
              </CardContent>
            </Card>
          ) : (
            filteredTasks.map(task => (
              <Card key={task.id} className="hover:border-primary/50 transition">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="mb-1">{task.title}</CardTitle>
                      <CardDescription>{task.description}</CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">
                        ${task.paymentAmount}
                      </p>
                      <p className="text-xs text-muted-foreground">{task.currency}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline">{task.category}</Badge>
                      <Badge className={getDifficultyColor(task.difficulty)}>
                        {task.difficulty.charAt(0).toUpperCase() + task.difficulty.slice(1)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {task.applicants} applicants
                      </span>
                    </div>
                    <Button className="gap-2">
                      View Details
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
