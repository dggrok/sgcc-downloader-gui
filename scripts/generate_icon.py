from __future__ import annotations

import sys
from pathlib import Path

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import (
    QBrush,
    QColor,
    QGuiApplication,
    QImage,
    QLinearGradient,
    QPainter,
    QPainterPath,
    QPen,
    QPixmap,
    QPolygonF,
)


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets"
ICO_PATH = ASSETS_DIR / "app.ico"
PNG_PATH = ASSETS_DIR / "app_preview.png"


def rounded_rect_path(rect: QRectF, radius: float) -> QPainterPath:
    path = QPainterPath()
    path.addRoundedRect(rect, radius, radius)
    return path


def draw_background(painter: QPainter, size: int) -> None:
    base_rect = QRectF(0, 0, size, size)

    gradient = QLinearGradient(0, 0, size, size)
    gradient.setColorAt(0.0, QColor("#0B2E59"))
    gradient.setColorAt(0.55, QColor("#114C84"))
    gradient.setColorAt(1.0, QColor("#16A3A1"))
    painter.fillPath(rounded_rect_path(base_rect.adjusted(6, 6, -6, -6), size * 0.22), gradient)

    halo = QLinearGradient(size * 0.15, size * 0.1, size * 0.88, size * 0.82)
    halo.setColorAt(0.0, QColor(255, 255, 255, 50))
    halo.setColorAt(1.0, QColor(255, 255, 255, 0))
    painter.fillPath(rounded_rect_path(base_rect.adjusted(14, 14, -14, -14), size * 0.18), halo)

    painter.setPen(QPen(QColor(255, 255, 255, 28), max(2, size // 96)))
    for offset in (0.18, 0.34, 0.5, 0.66, 0.82):
        x = size * offset
        y = size * offset
        painter.drawLine(int(x), int(size * 0.14), int(x), int(size * 0.86))
        painter.drawLine(int(size * 0.14), int(y), int(size * 0.86), int(y))


def draw_document(painter: QPainter, size: int) -> None:
    doc_rect = QRectF(size * 0.24, size * 0.18, size * 0.43, size * 0.56)
    corner = size * 0.045

    shadow_path = rounded_rect_path(doc_rect.translated(size * 0.015, size * 0.022), corner)
    painter.fillPath(shadow_path, QColor(0, 0, 0, 35))

    document_path = rounded_rect_path(doc_rect, corner)
    painter.fillPath(document_path, QColor("#F7FBFF"))

    painter.setPen(QPen(QColor("#C7D7E9"), max(2, size // 110)))
    painter.drawPath(document_path)

    fold_path = QPainterPath()
    fold_path.moveTo(doc_rect.right() - size * 0.1, doc_rect.top())
    fold_path.lineTo(doc_rect.right(), doc_rect.top() + size * 0.1)
    fold_path.lineTo(doc_rect.right() - size * 0.1, doc_rect.top() + size * 0.1)
    fold_path.closeSubpath()
    painter.fillPath(fold_path, QColor("#D8E8F6"))

    line_pen = QPen(QColor("#86A8C6"), max(2, size // 120), Qt.SolidLine, Qt.RoundCap)
    painter.setPen(line_pen)
    left = doc_rect.left() + size * 0.07
    right = doc_rect.right() - size * 0.08
    for y_factor, short in ((0.30, False), (0.42, False), (0.54, True)):
        y = doc_rect.top() + doc_rect.height() * y_factor
        painter.drawLine(QPointF(left, y), QPointF(right - (size * 0.08 if short else 0), y))


def draw_download_badge(painter: QPainter, size: int) -> None:
    circle_center = QPointF(size * 0.67, size * 0.69)
    circle_radius = size * 0.17

    painter.setBrush(QBrush(QColor("#F5B73A")))
    painter.setPen(Qt.NoPen)
    painter.drawEllipse(circle_center, circle_radius, circle_radius)

    painter.setBrush(QBrush(QColor("#0D315B")))
    shaft = QRectF(
        circle_center.x() - size * 0.028,
        circle_center.y() - size * 0.09,
        size * 0.056,
        size * 0.12,
    )
    painter.drawRoundedRect(shaft, size * 0.02, size * 0.02)

    arrow = QPolygonF(
        [
            QPointF(circle_center.x(), circle_center.y() + size * 0.085),
            QPointF(circle_center.x() - size * 0.085, circle_center.y() - size * 0.005),
            QPointF(circle_center.x() - size * 0.032, circle_center.y() - size * 0.005),
            QPointF(circle_center.x() - size * 0.032, circle_center.y() - size * 0.09),
            QPointF(circle_center.x() + size * 0.032, circle_center.y() - size * 0.09),
            QPointF(circle_center.x() + size * 0.032, circle_center.y() - size * 0.005),
            QPointF(circle_center.x() + size * 0.085, circle_center.y() - size * 0.005),
        ]
    )
    painter.drawPolygon(arrow)


def render_icon(size: int = 256) -> QImage:
    image = QImage(size, size, QImage.Format_ARGB32)
    image.fill(Qt.transparent)

    painter = QPainter(image)
    painter.setRenderHint(QPainter.Antialiasing, True)
    painter.setRenderHint(QPainter.SmoothPixmapTransform, True)

    draw_background(painter, size)
    draw_document(painter, size)
    draw_download_badge(painter, size)

    painter.end()
    return image


def save_outputs() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    image = render_icon()
    if not image.save(str(ICO_PATH), "ICO"):
        raise RuntimeError(f"无法写入图标文件: {ICO_PATH}")
    if not image.save(str(PNG_PATH), "PNG"):
        raise RuntimeError(f"无法写入预览文件: {PNG_PATH}")


def main() -> int:
    app = QGuiApplication(sys.argv)
    save_outputs()
    app.quit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
