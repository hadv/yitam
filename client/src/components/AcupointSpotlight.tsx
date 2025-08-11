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
  x_coordinate?: number;
  y_coordinate?: number;
  onClose: () => void;
}

const AcupointSpotlight: React.FC<AcupointSpotlightProps> = ({
  imageUrl,
  boundingBox,
  acupointSymbol,
  vietnameseName,
  x_coordinate,
  y_coordinate,
  onClose
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (imageLoaded && x_coordinate !== undefined && y_coordinate !== undefined) {
      drawSpotlightEffect();
    }
  }, [imageLoaded, x_coordinate, y_coordinate, zoom, pan]);

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
    if (!canvas || !image || x_coordinate === undefined || y_coordinate === undefined) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image display size
    const rect = image.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate acupoint position coordinates
    const acupointX = (x_coordinate / 100) * canvas.width;
    const acupointY = (y_coordinate / 100) * canvas.height;

    // Debug logging
    console.log(`🎯 DEBUG Spotlight:`, {
      x_coordinate,
      y_coordinate,
      canvas: { width: canvas.width, height: canvas.height },
      image: { width: image.naturalWidth, height: image.naturalHeight },
      calculated: { acupointX, acupointY },
      imageRect: rect
    });

    // Create spotlight area around acupoint position
    const spotlightRadius = 40; // Radius around acupoint
    const spotlightX1 = acupointX - spotlightRadius;
    const spotlightY1 = acupointY - spotlightRadius;
    const spotlightWidth = spotlightRadius * 2;
    const spotlightHeight = spotlightRadius * 2;

    // Create simple spotlight effect without overlay
    ctx.save();

    // Draw glowing circle at acupoint position
    ctx.beginPath();
    ctx.arc(acupointX, acupointY, spotlightRadius, 0, 2 * Math.PI);

    // Glowing effect
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 15;
    ctx.stroke();

    // Inner circle
    ctx.beginPath();
    ctx.arc(acupointX, acupointY, spotlightRadius - 10, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(acupointX, acupointY, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#00ff88';
    ctx.shadowBlur = 10;
    ctx.fill();

    // Debug: Draw coordinate text
    ctx.fillStyle = '#ff0000';
    ctx.font = '12px Arial';
    ctx.fillText(`(${x_coordinate.toFixed(1)}%, ${y_coordinate.toFixed(1)}%)`, acupointX + 50, acupointY - 50);
    ctx.fillText(`Pixel: (${acupointX.toFixed(0)}, ${acupointY.toFixed(0)})`, acupointX + 50, acupointY - 35);

    ctx.restore();

    // Add acupoint label
    drawAcupointLabel(ctx, acupointX - spotlightRadius, acupointY - spotlightRadius - 70, spotlightRadius * 2);
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
        {x_coordinate !== undefined && y_coordinate !== undefined && (
          <div className="info-item">
            <strong>Tọa độ huyệt:</strong> ({x_coordinate.toFixed(1)}%, {y_coordinate.toFixed(1)}%)
          </div>
        )}
      </div>
    </div>
  );
};

export default AcupointSpotlight;
