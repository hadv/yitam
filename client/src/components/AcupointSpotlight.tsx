import React, { useRef, useEffect, useState } from 'react';
import './AcupointSpotlight.css';

interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface AcupointSpotlightProps {
  imageUrl: string;
  boundingBox?: BoundingBox;
  acupointSymbol: string;
  vietnameseName: string;
  onClose: () => void;
}

const AcupointSpotlight: React.FC<AcupointSpotlightProps> = ({
  imageUrl,
  boundingBox,
  acupointSymbol,
  vietnameseName,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (imageLoaded && boundingBox) {
      drawSpotlightEffect();
    }
  }, [imageLoaded, boundingBox, zoom, pan]);

  // Polyfill for roundRect if not supported
  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
    } else {
      // Manual rounded rectangle
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
  };

  const drawSpotlightEffect = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !boundingBox ||
        boundingBox.x1 === undefined || boundingBox.y1 === undefined ||
        boundingBox.x2 === undefined || boundingBox.y2 === undefined) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image display size
    const rect = image.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate actual bounding box coordinates with safe defaults
    const spotlightX1 = ((boundingBox.x1 || 0) / 100) * canvas.width;
    const spotlightY1 = ((boundingBox.y1 || 0) / 100) * canvas.height;
    const spotlightX2 = ((boundingBox.x2 || 0) / 100) * canvas.width;
    const spotlightY2 = ((boundingBox.y2 || 0) / 100) * canvas.height;

    // Create spotlight effect
    ctx.save();

    // Fill entire canvas with semi-transparent black (grayscale effect)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cut out the spotlight area (clear the region)
    ctx.globalCompositeOperation = 'destination-out';
    
    // Add padding around bounding box
    const padding = 10;
    const spotlightWidth = spotlightX2 - spotlightX1 + (padding * 2);
    const spotlightHeight = spotlightY2 - spotlightY1 + (padding * 2);
    
    // Create rounded rectangle for spotlight
    const cornerRadius = 8;
    roundRect(
      ctx,
      spotlightX1 - padding,
      spotlightY1 - padding,
      spotlightWidth,
      spotlightHeight,
      cornerRadius
    );
    ctx.fill();

    // Add glowing border
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;
    ctx.stroke();

    ctx.restore();

    // Add acupoint label
    drawAcupointLabel(ctx, spotlightX1, spotlightY1, spotlightWidth);
  };

  const drawAcupointLabel = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number) => {
    // Label background
    const labelHeight = 60;
    const labelY = y - labelHeight - 10;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    roundRect(ctx, x, labelY, width, labelHeight, 8);
    ctx.fill();

    // Label border
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Symbol text
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(acupointSymbol, x + width/2, labelY + 25);

    // Vietnamese name
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(vietnameseName, x + width/2, labelY + 45);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.5));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="acupoint-spotlight-modal">
      <div className="spotlight-header">
        <div className="spotlight-title">
          <h3>{acupointSymbol} - {vietnameseName}</h3>
          <p>Vị trí huyệt được phát hiện tự động</p>
        </div>
        <div className="spotlight-controls">
          <button onClick={handleZoomIn} className="zoom-btn">🔍+</button>
          <button onClick={handleZoomOut} className="zoom-btn">🔍-</button>
          <button onClick={handleReset} className="reset-btn">↺</button>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
      </div>

      <div className="spotlight-container">
        <div className="image-container" style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)` }}>
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Vessel with acupoint"
            onLoad={handleImageLoad}
            className="vessel-image"
          />
          <canvas
            ref={canvasRef}
            className="spotlight-canvas"
          />
        </div>
      </div>

      <div className="spotlight-info">
        <div className="info-item">
          <strong>Ký hiệu:</strong> {acupointSymbol}
        </div>
        <div className="info-item">
          <strong>Tên tiếng Việt:</strong> {vietnameseName}
        </div>
        <div className="info-item">
          <strong>Phương pháp:</strong> Tự động phát hiện bằng AI
        </div>
        {boundingBox && boundingBox.x1 !== undefined && boundingBox.y1 !== undefined && (
          <div className="info-item">
            <strong>Tọa độ:</strong> ({(boundingBox.x1 || 0).toFixed(1)}%, {(boundingBox.y1 || 0).toFixed(1)}%) - ({(boundingBox.x2 || 0).toFixed(1)}%, {(boundingBox.y2 || 0).toFixed(1)}%)
          </div>
        )}
      </div>
    </div>
  );
};

export default AcupointSpotlight;
