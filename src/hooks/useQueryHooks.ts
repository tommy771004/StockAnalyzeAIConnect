import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../services/api';

import { WatchlistItem } from '../types';

export const useWatchlist = () => {
  return useQuery<WatchlistItem[]>({
    queryKey: ['liquid_intel_watchlist'],
    queryFn: () => api.getWatchlist(),
  });
};

export const useUpdateWatchlist = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newList: WatchlistItem[]) => api.setWatchlist(newList),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['liquid_intel_watchlist'] });
    },
  });
};

export const useSystemStats = () => {
  return useQuery({
    queryKey: ['systemStats'],
    queryFn: () => api.getSystemStats(),
    refetchInterval: 5000, // 每 5 秒更新一次
  });
};
