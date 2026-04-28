import { Clock3, Heart, Trash2 } from "lucide-react";
import type { RouteOption } from "../domain/types";

interface StoragePanelProps {
  favorites: RouteOption[];
  history: RouteOption[];
  selectedRouteId?: string;
  onSelectRoute: (route: RouteOption) => void;
  onRemoveFavorite: (routeId: string) => void;
  onClearHistory: () => void;
}

export function StoragePanel({
  favorites,
  history,
  selectedRouteId,
  onSelectRoute,
  onRemoveFavorite,
  onClearHistory,
}: StoragePanelProps) {
  return (
    <aside className="storage-panel">
      <section>
        <div className="section-heading">
          <Heart size={16} />
          <h2>Favorites</h2>
        </div>
        {favorites.length === 0 ? (
          <p className="empty-copy">Saved routes will appear here.</p>
        ) : (
          <div className="stored-list">
            {favorites.slice(0, 6).map((route) => (
              <StoredRouteButton
                key={route.id}
                route={route}
                selected={route.id === selectedRouteId}
                onSelectRoute={onSelectRoute}
                trailing={
                  <button
                    type="button"
                    className="tiny-icon-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveFavorite(route.id);
                    }}
                    title="Remove favorite"
                  >
                    <Trash2 size={14} />
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-heading">
          <Clock3 size={16} />
          <h2>History</h2>
          {history.length > 0 ? (
            <button type="button" className="text-button" onClick={onClearHistory}>
              Clear
            </button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="empty-copy">Generated routes will be stored locally.</p>
        ) : (
          <div className="stored-list">
            {history.slice(0, 8).map((route) => (
              <StoredRouteButton
                key={route.id}
                route={route}
                selected={route.id === selectedRouteId}
                onSelectRoute={onSelectRoute}
              />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function StoredRouteButton({
  route,
  selected,
  onSelectRoute,
  trailing,
}: {
  route: RouteOption;
  selected: boolean;
  onSelectRoute: (route: RouteOption) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`stored-route ${selected ? "selected" : ""}`}
      onClick={() => onSelectRoute(route)}
    >
      <span>
        <strong>{route.name}</strong>
        <small>
          {route.distanceKm} km · D+ {route.elevationGainM} m
        </small>
      </span>
      {trailing}
    </button>
  );
}
