'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { categoryKeys } from '../constants';
import type { CreateCategoryValues, UpdateCategoryInput } from '../schemas/category.schema';
import { createCategory, deleteCategory, updateCategory } from '../services/category.service';

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCategoryValues) => createCategory(input),
    onSuccess: async (category) => {
      await queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      toast.success(`Categoría "${category.name}" creada`);
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      updateCategory(id, input),
    onSuccess: async (category) => {
      await queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      toast.success(`Categoría "${category.name}" actualizada`);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: async (category) => {
      await queryClient.invalidateQueries({ queryKey: categoryKeys.lists() });
      toast.success(`Categoría "${category.name}" desactivada`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
