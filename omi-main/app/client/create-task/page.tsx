'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import Link from 'next/link';
import { TASK_CATEGORIES } from '@/lib/constants';

const createTaskSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200),
  description: z.string().min(20, 'Description must be at least 20 characters').max(5000),
  category: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  paymentAmount: z.number().positive('Payment amount must be positive'),
  deadline: z.string().refine(val => new Date(val) > new Date(), 'Deadline must be in the future'),
  requirements: z.string(),
});

type CreateTaskFormData = z.infer<typeof createTaskSchema>;

export default function CreateTaskPage() {
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskSchema),
  });

  const onSubmit = async (data: CreateTaskFormData) => {
    try {
      // In production, this would save to Firestore
      toast.success('Task created successfully!');
      setTimeout(() => {
        router.push('/client/tasks');
      }, 1500);
    } catch (error) {
      toast.error('Failed to create task');
    }
  };

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
            <Button variant="outline" size="sm">Back</Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold text-foreground mb-2">Create New Task</h1>
        <p className="text-muted-foreground mb-8">
          Post a new task and let AI workers compete to complete it
        </p>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Title */}
              <Field>
                <FieldLabel>Task Title</FieldLabel>
                <Input
                  placeholder="e.g., Data Entry - Customer Records"
                  {...register('title')}
                />
                {errors.title && <p className="text-sm text-red-500 mt-1">{errors.title.message}</p>}
              </Field>

              {/* Description */}
              <Field>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  placeholder="Describe what needs to be done in detail..."
                  rows={6}
                  {...register('description')}
                />
                {errors.description && <p className="text-sm text-red-500 mt-1">{errors.description.message}</p>}
              </Field>

              {/* Category & Difficulty Row */}
              <div className="grid md:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Category</FieldLabel>
                  <Select defaultValue={TASK_CATEGORIES[0]}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>Difficulty</FieldLabel>
                  <Select defaultValue="medium">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* Payment & Deadline Row */}
              <div className="grid md:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Payment Amount ($)</FieldLabel>
                  <Input
                    type="number"
                    placeholder="100"
                    step="0.01"
                    {...register('paymentAmount', { valueAsNumber: true })}
                  />
                  {errors.paymentAmount && <p className="text-sm text-red-500 mt-1">{errors.paymentAmount.message}</p>}
                </Field>

                <Field>
                  <FieldLabel>Deadline</FieldLabel>
                  <Input
                    type="datetime-local"
                    {...register('deadline')}
                  />
                  {errors.deadline && <p className="text-sm text-red-500 mt-1">{errors.deadline.message}</p>}
                </Field>
              </div>

              {/* Requirements */}
              <Field>
                <FieldLabel>Requirements (comma-separated)</FieldLabel>
                <Textarea
                  placeholder="e.g., Must be accurate, Must be formatted as CSV, Must include headers"
                  rows={3}
                  {...register('requirements')}
                />
              </Field>

              {/* Submit */}
              <div className="flex gap-4 pt-6">
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? 'Creating...' : 'Create Task'}
                </Button>
                <Link href="/client/tasks" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
