'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Clock, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

const mockClientTasks = [
  {
    id: '1',
    title: 'Data Entry - Q4 Sales Records',
    status: 'open',
    applicants: 8,
    paymentAmount: 200,
    postedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    title: 'Content Writing - Blog Series',
    status: 'in_progress',
    applicants: 0,
    assignedWorker: 'Alice Chen',
    paymentAmount: 500,
    postedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: '3',
    title: 'Market Research Report',
    status: 'completed',
    applicants: 0,
    assignedWorker: 'Bob Wilson',
    paymentAmount: 1000,
    postedDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
  {
    id: '4',
    title: 'Image Tagging - Product Catalog',
    status: 'cancelled',
    applicants: 3,
    paymentAmount: 300,
    postedDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
  },
];

function getStatusIcon(status: string) {
  switch (status) {
    case 'open':
      return <Clock className="w-4 h-4" />;
    case 'in_progress':
      return <Clock className="w-4 h-4" />;
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'cancelled':
      return <XCircle className="w-4 h-4 text-red-500" />;
    default:
      return null;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'open':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'in_progress':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    case 'completed':
      return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'cancelled':
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    default:
      return '';
  }
}

export default function ClientTasksPage() {
  const { currentUser, loading } = useAuth();
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Your Tasks</h1>
            <p className="text-muted-foreground">Manage and track all your posted tasks</p>
          </div>
          <Link href="/client/create-task">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Post New Task
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Tasks', value: mockClientTasks.length, color: 'text-blue-500' },
            { label: 'Open', value: mockClientTasks.filter(t => t.status === 'open').length, color: 'text-yellow-500' },
            { label: 'In Progress', value: mockClientTasks.filter(t => t.status === 'in_progress').length, color: 'text-orange-500' },
            { label: 'Completed', value: mockClientTasks.filter(t => t.status === 'completed').length, color: 'text-green-500' },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tasks Table */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Tasks</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-6">
            {mockClientTasks.map(task => (
              <Card key={task.id} className="hover:border-primary/50 transition">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        {getStatusIcon(task.status)}
                        <div>
                          <h3 className="font-semibold text-foreground">{task.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Posted {Math.floor((Date.now() - task.postedDate.getTime()) / (24 * 60 * 60 * 1000))} days ago
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">${task.paymentAmount}</p>
                        {task.status === 'open' && (
                          <p className="text-xs text-muted-foreground">{task.applicants} applicants</p>
                        )}
                        {(task.status === 'in_progress' || task.status === 'completed') && (
                          <p className="text-xs text-muted-foreground">{task.assignedWorker}</p>
                        )}
                      </div>
                      <Badge className={getStatusColor(task.status)}>
                        {task.status.replace('_', ' ').charAt(0).toUpperCase() + task.status.slice(1).replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="open" className="space-y-4 mt-6">
            {mockClientTasks.filter(t => t.status === 'open').map(task => (
              <Card key={task.id}>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-foreground">{task.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{task.applicants} applicants</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="in_progress" className="space-y-4 mt-6">
            {mockClientTasks.filter(t => t.status === 'in_progress').map(task => (
              <Card key={task.id}>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-foreground">{task.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">Assigned to: {task.assignedWorker}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4 mt-6">
            {mockClientTasks.filter(t => t.status === 'completed').map(task => (
              <Card key={task.id}>
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-foreground">{task.title}</h3>
                  <p className="text-sm text-green-500 mt-2">Completed by: {task.assignedWorker}</p>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
