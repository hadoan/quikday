import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { updateMe, fetchUserMe } from '@/apis/users';

const schema = z.object({
  name: z
    .string()
    .min(1, { message: 'Name is required' })
    .max(120, { message: 'Name is too long' }),
  avatar: z
    .string()
    .url({ message: 'Must be a valid URL' })
    .or(z.literal(''))
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

type FormValues = z.infer<typeof schema>;

export default function ProfileSettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getUserProfile } = useKindeAuth();

  const { data: me, isLoading: isLoadingMe } = useQuery({
    queryKey: ['user.me'],
    queryFn: fetchUserMe,
  });

  const [kindePicture, setKindePicture] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getUserProfile?.();
        if (!cancelled) setKindePicture((p as any)?.picture as string | undefined);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getUserProfile]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', avatar: undefined },
    mode: 'onChange',
  });

  // Hydrate form with current user when loaded
  useEffect(() => {
    if (!me) return;
    form.reset({ name: me.name || '', avatar: me.avatar });
  }, [me, form]);

  const currentInitials = useMemo(() => {
    const name = form.getValues('name') || me?.name || me?.email || '';
    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join('')
      .toUpperCase();
    return initials || 'U';
  }, [form, me]);

  const avatarPreview = form.watch('avatar') || kindePicture;

  const mutation = useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
      navigate(-1);
    },
    onError: (err: any) => {
      const message = err?.response?.data?.message || err?.message || 'Update failed';
      toast({ title: 'Failed to update', description: message, variant: 'destructive' });
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate({ name: values.name, avatar: values.avatar });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold">Edit Profile</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage your personal information.
          </p>
        </div>

        <Card className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Avatar className="h-14 w-14 sm:h-16 sm:w-16">
                {avatarPreview && <AvatarImage src={avatarPreview} alt={me?.name || 'Avatar'} />}
                <AvatarFallback className="bg-primary text-primary-foreground text-sm sm:text-base">
                  {currentInitials}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-medium text-sm sm:text-base">{me?.name ?? 'User'}</div>
                <div className="text-xs text-muted-foreground break-all">{me?.email}</div>
              </div>
            </div>

            <div className="flex-1">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="avatar"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Avatar URL (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2 justify-end pt-2">
                    <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={mutation.isPending || isLoadingMe}>
                      {mutation.isPending ? 'Saving...' : 'Save changes'}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
