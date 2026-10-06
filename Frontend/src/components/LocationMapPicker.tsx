import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Modal from "../ui/Modal";
import Btn from "../ui/Btn";

// Leaflet's default marker icon references image files via relative paths
// that Vite's bundler doesn't resolve the same way webpack did — without
// this, the pin renders as a broken image.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationMapPicker({
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}: {
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number) => void;
  onClose: () => void;
}) {
  // Default to roughly central India when no pin exists yet — just a
  // starting viewport, not a real guess at the project's location.
  const [pos, setPos] = useState<[number, number]>([
    initialLat ?? 23.2599,
    initialLng ?? 77.4126,
  ]);

  return (
    <Modal title="Pick project location" onClose={onClose} extraWide
      footer={
        <>
          <Btn label="Cancel" outline onClick={onClose} />
          <Btn label="Save location" onClick={() => onConfirm(pos[0], pos[1])} />
        </>
      }
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Click anywhere on the map to drop/move the pin, then Save.
      </div>
      <div style={{ height: 420, borderRadius: 8, overflow: "hidden" }}>
        <MapContainer center={pos} zoom={initialLat ? 15 : 5} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={pos} icon={markerIcon} />
          <ClickCapture onPick={(lat, lng) => setPos([lat, lng])} />
        </MapContainer>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono">
        {pos[0].toFixed(6)}, {pos[1].toFixed(6)}
      </div>
    </Modal>
  );
}
