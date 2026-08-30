import React, { useState, useEffect } from 'react';
import { dbService } from '../../services/db';
import type { WatchHistoryItem, LikedItem, WatchlistItem } from '../../types/db';
import type { TMDBMediaItem } from '../../types/tmdb';
import { MediaCard } from '../../components/common/MediaCard';
import { History, Heart, Bookmark, Trash2 } from 'lucide-react';
import { useDevice } from '../../hooks/useDevice';

export const Library: React.FC = () => {
  const { isTV } = useDevice();
  const [activeTab, setActiveTab] = useState<'history' | 'likes' | 'watchlist'>('history');
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [likes, setLikes] = useState<LikedItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  const loadData = async () => {
    const [h, l, w] = await Promise.all([
      dbService.getHistory(50),
      dbService.getLikes(),
      dbService.getWatchlist()
    ]);
    setHistory(h);
    setLikes(l);
    setWatchlist(w);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear your entire watch history?')) {
      await dbService.clearHistory();
      setHistory([]);
    }
  };

  const handleRemoveHistoryItem = async (e: React.MouseEvent, item: WatchHistoryItem) => {
    e.stopPropagation();
    await dbService.removeFromHistory(item.tmdbId, item.mediaType);
    setHistory((prev) => prev.filter((h) => !(h.tmdbId === item.tmdbId && h.mediaType === item.mediaType)));
  };

  const handleRemoveLike = async (e: React.MouseEvent, item: LikedItem) => {
    e.stopPropagation();
    await dbService.toggleLike({
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      voteAverage: item.voteAverage
    });
    setLikes((prev) => prev.filter((l) => !(l.tmdbId === item.tmdbId && l.mediaType === item.mediaType)));
  };

  const handleRemoveWatchlist = async (e: React.MouseEvent, item: WatchlistItem) => {
    e.stopPropagation();
    await dbService.toggleWatchlist({
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      posterPath: item.posterPath,
      backdropPath: item.backdropPath,
      voteAverage: item.voteAverage
    });
    setWatchlist((prev) => prev.filter((w) => !(w.tmdbId === item.tmdbId && w.mediaType === item.mediaType)));
  };

  const convertToMediaItem = (item: WatchHistoryItem | LikedItem | WatchlistItem): TMDBMediaItem => ({
    id: item.tmdbId,
    title: item.title,
    overview: '',
    poster_path: item.posterPath,
    backdrop_path: item.backdropPath,
    vote_average: item.voteAverage || 0,
    vote_count: 0,
    popularity: 0,
    original_language: 'en',
    media_type: item.mediaType
  });

  return (
    <div className={`min-h-screen ${isTV ? 'pt-6 sm:pt-8 pb-16 px-6 lg:px-8' : 'pt-20 sm:pt-24 pb-20 px-4 sm:px-6'} max-w-7xl mx-auto`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-white tracking-tight flex items-center gap-2">
            <span className="w-2 h-6 bg-hbo-purple-light rounded-full"></span>
            My Space & Library
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Stored locally on your device via IndexedDB
          </p>
        </div>

        {activeTab === 'history' && history.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-xs font-bold transition tv-focus-target"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2.5 sm:gap-3 border-b border-hbo-border/70 pb-4 mb-6 overflow-x-auto no-scrollbar py-3 px-3.5 sm:px-4 -mx-2 sm:-mx-3 scroll-pl-4 scroll-pr-4">
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition border whitespace-nowrap flex-shrink-0 tv-focus-target ${
            activeTab === 'history'
              ? 'bg-hbo-purple text-white border-hbo-purple-light shadow-hbo-glow'
              : 'bg-hbo-card text-gray-400 border-hbo-border hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Watch History ({history.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('likes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition border whitespace-nowrap flex-shrink-0 tv-focus-target ${
            activeTab === 'likes'
              ? 'bg-hbo-purple text-white border-hbo-purple-light shadow-hbo-glow'
              : 'bg-hbo-card text-gray-400 border-hbo-border hover:text-white'
          }`}
        >
          <Heart className="w-4 h-4" />
          <span>Liked Titles ({likes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition border whitespace-nowrap flex-shrink-0 tv-focus-target ${
            activeTab === 'watchlist'
              ? 'bg-hbo-purple text-white border-hbo-purple-light shadow-hbo-glow'
              : 'bg-hbo-card text-gray-400 border-hbo-border hover:text-white'
          }`}
        >
          <Bookmark className="w-4 h-4" />
          <span>Watchlist ({watchlist.length})</span>
        </button>
      </div>

      {/* Tab Content Display */}
      {activeTab === 'history' && (
        <div>
          {history.length > 0 ? (
            <div className="grid grid-cols-5 gap-3.5 sm:gap-4 py-2 px-1">
              {history.map((item) => (
                <div key={`${item.tmdbId}-${item.mediaType}`} className="flex justify-center">
                  <MediaCard
                    item={convertToMediaItem(item)}
                    type={item.mediaType}
                    progress={item.progressPercent}
                    onDelete={() => {
                      dbService.removeFromHistory(item.tmdbId, item.mediaType);
                      setHistory((prev) => prev.filter((h) => !(h.tmdbId === item.tmdbId && h.mediaType === item.mediaType)));
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <History className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-base font-bold">No watch history yet</p>
              <p className="text-xs text-gray-500 mt-1">Start streaming any movie or episode to keep track of your progress.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'likes' && (
        <div>
          {likes.length > 0 ? (
            <div className="grid grid-cols-5 gap-3.5 sm:gap-4 py-2 px-1">
              {likes.map((item) => (
                <div key={`${item.tmdbId}-${item.mediaType}`} className="flex justify-center">
                  <MediaCard
                    item={convertToMediaItem(item)}
                    type={item.mediaType}
                    onDelete={() => {
                      dbService.toggleLike(item);
                      setLikes((prev) => prev.filter((l) => !(l.tmdbId === item.tmdbId && l.mediaType === item.mediaType)));
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-hbo-card/30 border border-hbo-border/40 rounded-2xl">
              <Heart className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-gray-300">No liked titles yet</h3>
              <p className="text-xs text-gray-500 mt-1">Tap the heart on any title to save your favorites here.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'watchlist' && (
        <div>
          {watchlist.length > 0 ? (
            <div className="grid grid-cols-5 gap-3.5 sm:gap-4 py-2 px-1">
              {watchlist.map((item) => (
                <div key={`${item.tmdbId}-${item.mediaType}`} className="flex justify-center">
                  <MediaCard
                    item={convertToMediaItem(item)}
                    type={item.mediaType}
                    onDelete={() => {
                      dbService.toggleWatchlist(item);
                      setWatchlist((prev) => prev.filter((w) => !(w.tmdbId === item.tmdbId && w.mediaType === item.mediaType)));
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400">
              <Bookmark className="w-12 h-12 mx-auto mb-3 text-gray-600" />
              <p className="text-base font-bold">Your watchlist is empty</p>
              <p className="text-xs text-gray-500 mt-1">Save upcoming movies and series to watch later.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

