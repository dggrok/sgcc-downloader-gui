from __future__ import annotations

from typing import Any

from PySide6.QtCore import QAbstractTableModel, QModelIndex, Qt

from sgcc_gui.core.models import AttachmentRecord


class AttachmentTableModel(QAbstractTableModel):
    HEADERS = ["下载", "附件名", "公告标题", "公告 ID", "机构", "状态", "保存路径"]

    def __init__(self) -> None:
        super().__init__()
        self.records: list[AttachmentRecord] = []

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:
        if parent.isValid():
            return 0
        return len(self.records)

    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        if parent.isValid():
            return 0
        return len(self.HEADERS)

    def headerData(self, section: int, orientation: Qt.Orientation, role: int = Qt.DisplayRole) -> Any:
        if role != Qt.DisplayRole:
            return None
        if orientation == Qt.Horizontal:
            return self.HEADERS[section]
        return section + 1

    def flags(self, index: QModelIndex) -> Qt.ItemFlags:
        if not index.isValid():
            return Qt.NoItemFlags
        flags = Qt.ItemIsSelectable | Qt.ItemIsEnabled
        if index.column() == 0:
            flags |= Qt.ItemIsUserCheckable
        return flags

    def data(self, index: QModelIndex, role: int = Qt.DisplayRole) -> Any:
        if not index.isValid():
            return None
        record = self.records[index.row()]
        column = index.column()

        if role == Qt.CheckStateRole and column == 0:
            return Qt.Checked if record.selected else Qt.Unchecked

        if role == Qt.DisplayRole:
            if column == 1:
                return record.file_name
            if column == 2:
                return record.notice_title
            if column == 3:
                return record.notice_id
            if column == 4:
                return record.org_name
            if column == 5:
                return record.status
            if column == 6:
                return record.local_path

        if role == Qt.ToolTipRole and column == 5 and record.error_message:
            return record.error_message
        return None

    def setData(self, index: QModelIndex, value: Any, role: int = Qt.EditRole) -> bool:
        if not index.isValid():
            return False
        record = self.records[index.row()]
        if role == Qt.CheckStateRole and index.column() == 0:
            record.selected = value == Qt.Checked
            self.dataChanged.emit(index, index, [Qt.CheckStateRole])
            return True
        return False

    def set_records(self, records: list[AttachmentRecord]) -> None:
        self.beginResetModel()
        self.records = records
        self.endResetModel()

    def refresh(self) -> None:
        if not self.records:
            return
        top_left = self.index(0, 0)
        bottom_right = self.index(len(self.records) - 1, self.columnCount() - 1)
        self.dataChanged.emit(top_left, bottom_right)

    def select_all(self, checked: bool) -> None:
        if not self.records:
            return
        for record in self.records:
            record.selected = checked
        self.refresh()

    def invert_selection(self) -> None:
        if not self.records:
            return
        for record in self.records:
            record.selected = not record.selected
        self.refresh()

    def selected_records(self) -> list[AttachmentRecord]:
        return [record for record in self.records if record.selected]
