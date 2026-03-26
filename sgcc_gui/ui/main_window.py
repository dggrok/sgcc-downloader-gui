from __future__ import annotations

from functools import partial
from pathlib import Path
from typing import Callable

from PySide6.QtCore import QSettings, Qt, QUrl
from PySide6.QtGui import QAction, QDesktopServices
from PySide6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QCheckBox,
    QFileDialog,
    QFormLayout,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QProgressBar,
    QSpinBox,
    QSplitter,
    QStatusBar,
    QTableView,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from sgcc_gui.core.models import AttachmentRecord, DownloadResult, OrgNode, SearchParams, TaskProgress
from sgcc_gui.core.utils import CancelToken, default_download_root
from sgcc_gui.service.crawler_service import SGCCCrawlerService
from sgcc_gui.ui.table_model import AttachmentTableModel
from sgcc_gui.ui.workers import DownloadWorker, FunctionWorker, PreviewWorker
from sgcc_gui.version import APP_VERSION, PRODUCT_NAME


PLACEHOLDER_ROLE = Qt.UserRole + 1
LOADED_ROLE = Qt.UserRole + 2


class MainWindow(QMainWindow):
    def __init__(
        self,
        service_factory: Callable[[Callable[[str], None] | None], SGCCCrawlerService],
        logger,
    ) -> None:
        super().__init__()
        self.service_factory = service_factory
        self.logger = logger
        self.settings = QSettings("CodexDemo", "SGCCDownloader")
        self.table_model = AttachmentTableModel()
        self.table_model.dataChanged.connect(lambda *_: self._update_selection_summary())
        self.table_model.modelReset.connect(self._update_selection_summary)
        self.selected_org: OrgNode | None = None
        self.last_download_dir = Path(default_download_root())
        self.last_result_dir = Path(default_download_root())
        self.task_worker: PreviewWorker | DownloadWorker | None = None
        self.task_cancel_token: CancelToken | None = None
        self.org_workers: set[FunctionWorker] = set()

        self.setWindowTitle(f"{PRODUCT_NAME} v{APP_VERSION}")
        self.resize(1400, 900)
        self._build_ui()
        self._restore_settings()
        self._load_org_roots()

    def _build_ui(self) -> None:
        root_widget = QWidget(self)
        root_layout = QVBoxLayout(root_widget)

        splitter = QSplitter(Qt.Horizontal, self)
        splitter.addWidget(self._build_org_panel())
        splitter.addWidget(self._build_main_panel())
        splitter.setSizes([320, 980])
        root_layout.addWidget(splitter)

        self.setCentralWidget(root_widget)
        self.setStatusBar(QStatusBar(self))
        self.statusBar().showMessage("准备就绪")

        open_log_action = QAction("打开日志目录", self)
        open_log_action.triggered.connect(self.open_log_directory)
        self.menuBar().addAction(open_log_action)

    def _build_org_panel(self) -> QWidget:
        panel = QWidget(self)
        layout = QVBoxLayout(panel)

        org_group = QGroupBox("机构选择", panel)
        org_layout = QVBoxLayout(org_group)

        search_row = QHBoxLayout()
        self.org_search_input = QLineEdit(org_group)
        self.org_search_input.setPlaceholderText("输入机构名称后搜索")
        self.org_search_button = QPushButton("搜索机构", org_group)
        self.org_search_button.clicked.connect(self.search_orgs)
        search_row.addWidget(self.org_search_input)
        search_row.addWidget(self.org_search_button)
        org_layout.addLayout(search_row)

        self.org_tree = QTreeWidget(org_group)
        self.org_tree.setHeaderLabel("机构树")
        self.org_tree.itemExpanded.connect(self.on_org_item_expanded)
        self.org_tree.itemSelectionChanged.connect(self.on_org_tree_selection_changed)
        org_layout.addWidget(self.org_tree, stretch=3)

        self.org_result_list = QListWidget(org_group)
        self.org_result_list.itemClicked.connect(self.on_org_search_item_clicked)
        org_layout.addWidget(QLabel("搜索结果", org_group))
        org_layout.addWidget(self.org_result_list, stretch=2)

        self.selected_org_label = QLabel("当前未选择机构", org_group)
        self.selected_org_label.setWordWrap(True)
        org_layout.addWidget(self.selected_org_label)

        manual_group = QGroupBox("手动补偿", panel)
        manual_layout = QFormLayout(manual_group)
        self.manual_org_name_input = QLineEdit(manual_group)
        self.manual_org_name_input.setPlaceholderText("机构名称，例如：国网湖北省电力有限公司")
        self.manual_org_id_input = QLineEdit(manual_group)
        self.manual_org_id_input.setPlaceholderText("机构 ID，例如：2019061900100359")
        self.manual_apply_button = QPushButton("使用手动机构", manual_group)
        self.manual_apply_button.clicked.connect(self.apply_manual_org_selection)
        self.manual_org_name_input.returnPressed.connect(self.apply_manual_org_selection)
        self.manual_org_id_input.returnPressed.connect(self.apply_manual_org_selection)

        manual_hint = QLabel(
            "如果机构树或机构搜索没有数据，可以直接填写 orgName 和 orgId 继续查询。",
            manual_group,
        )
        manual_hint.setWordWrap(True)

        manual_layout.addRow("机构名称", self.manual_org_name_input)
        manual_layout.addRow("机构 ID", self.manual_org_id_input)
        manual_layout.addRow("", self.manual_apply_button)
        manual_layout.addRow("", manual_hint)

        layout.addWidget(org_group)
        layout.addWidget(manual_group)
        return panel

    def _build_main_panel(self) -> QWidget:
        panel = QWidget(self)
        layout = QVBoxLayout(panel)

        query_group = QGroupBox("查询条件", panel)
        query_layout = QGridLayout(query_group)

        self.keyword_input = QLineEdit(query_group)
        self.keyword_input.setPlaceholderText("公告关键词，例如：物资")

        self.page_spin = QSpinBox(query_group)
        self.page_spin.setRange(1, 9999)
        self.page_spin.setValue(1)

        self.size_spin = QSpinBox(query_group)
        self.size_spin.setRange(1, 100)
        self.size_spin.setValue(10)

        self.max_pages_spin = QSpinBox(query_group)
        self.max_pages_spin.setRange(1, 500)
        self.max_pages_spin.setValue(1)

        self.download_dir_input = QLineEdit(query_group)
        self.download_dir_input.setPlaceholderText("选择下载目录")
        self.browse_button = QPushButton("浏览...", query_group)
        self.browse_button.clicked.connect(self.choose_download_directory)
        self.reset_dir_button = QPushButton("恢复默认", query_group)
        self.reset_dir_button.clicked.connect(self.reset_download_directory)
        self.create_subdir_checkbox = QCheckBox("为本次任务创建子目录", query_group)
        self.create_subdir_checkbox.setChecked(True)

        query_layout.addWidget(QLabel("关键词"), 0, 0)
        query_layout.addWidget(self.keyword_input, 0, 1, 1, 5)
        query_layout.addWidget(QLabel("起始页"), 1, 0)
        query_layout.addWidget(self.page_spin, 1, 1)
        query_layout.addWidget(QLabel("每页数量"), 1, 2)
        query_layout.addWidget(self.size_spin, 1, 3)
        query_layout.addWidget(QLabel("最大页数"), 1, 4)
        query_layout.addWidget(self.max_pages_spin, 1, 5)
        query_layout.addWidget(QLabel("下载目录"), 2, 0)
        query_layout.addWidget(self.download_dir_input, 2, 1, 1, 3)
        query_layout.addWidget(self.browse_button, 2, 4)
        query_layout.addWidget(self.reset_dir_button, 2, 5)
        query_layout.addWidget(self.create_subdir_checkbox, 3, 1, 1, 3)

        layout.addWidget(query_group)

        table_group = QGroupBox("附件预览", panel)
        table_layout = QVBoxLayout(table_group)
        self.table_view = QTableView(table_group)
        self.table_view.setModel(self.table_model)
        self.table_view.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table_view.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table_view.setAlternatingRowColors(True)
        self.table_view.verticalHeader().setVisible(False)
        self.table_view.horizontalHeader().setStretchLastSection(True)
        self.table_view.setColumnWidth(0, 60)
        self.table_view.setColumnWidth(1, 260)
        self.table_view.setColumnWidth(2, 320)
        table_layout.addWidget(self.table_view)
        layout.addWidget(table_group, stretch=3)

        bottom_splitter = QSplitter(Qt.Vertical, panel)
        bottom_splitter.addWidget(self._build_task_panel())
        bottom_splitter.addWidget(self._build_log_panel())
        bottom_splitter.setSizes([220, 180])
        layout.addWidget(bottom_splitter, stretch=2)

        return panel

    def _build_task_panel(self) -> QWidget:
        panel = QWidget(self)
        layout = QVBoxLayout(panel)

        button_row = QHBoxLayout()
        self.query_button = QPushButton("查询公告", panel)
        self.query_button.clicked.connect(self.preview_attachments)
        self.select_all_button = QPushButton("全选", panel)
        self.select_all_button.clicked.connect(self.select_all_records)
        self.invert_button = QPushButton("反选", panel)
        self.invert_button.clicked.connect(self.invert_records)
        self.download_button = QPushButton("下载选中", panel)
        self.download_button.clicked.connect(self.download_selected)
        self.stop_button = QPushButton("停止", panel)
        self.stop_button.clicked.connect(self.stop_current_task)
        self.stop_button.setEnabled(False)
        self.open_dir_button = QPushButton("打开目录", panel)
        self.open_dir_button.clicked.connect(self.open_download_directory)

        for widget in (
            self.query_button,
            self.select_all_button,
            self.invert_button,
            self.download_button,
            self.stop_button,
            self.open_dir_button,
        ):
            button_row.addWidget(widget)
        button_row.addStretch()
        layout.addLayout(button_row)

        self.progress_label = QLabel("等待操作", panel)
        self.progress_bar = QProgressBar(panel)
        self.progress_bar.setRange(0, 1)
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_label)
        layout.addWidget(self.progress_bar)

        summary_form = QFormLayout()
        self.total_label = QLabel("0", panel)
        self.selected_label = QLabel("0", panel)
        summary_form.addRow("预览结果", self.total_label)
        summary_form.addRow("已勾选", self.selected_label)
        layout.addLayout(summary_form)

        return panel

    def _build_log_panel(self) -> QWidget:
        panel = QWidget(self)
        layout = QVBoxLayout(panel)
        layout.addWidget(QLabel("运行日志", panel))
        self.log_text = QPlainTextEdit(panel)
        self.log_text.setReadOnly(True)
        layout.addWidget(self.log_text)
        return panel

    def _restore_settings(self) -> None:
        self.download_dir_input.setText(
            self.settings.value("download_dir", str(default_download_root()))
        )
        self.keyword_input.setText(self.settings.value("keyword", ""))
        self.manual_org_name_input.setText(self.settings.value("manual_org_name", ""))
        self.manual_org_id_input.setText(self.settings.value("manual_org_id", ""))
        self.page_spin.setValue(int(self.settings.value("start_page", 1)))
        self.size_spin.setValue(int(self.settings.value("page_size", 10)))
        self.max_pages_spin.setValue(int(self.settings.value("max_pages", 1)))
        self.create_subdir_checkbox.setChecked(self.settings.value("create_subdir", True, type=bool))

        geometry = self.settings.value("geometry")
        if geometry:
            self.restoreGeometry(geometry)

        window_state = self.settings.value("window_state")
        if window_state:
            self.restoreState(window_state)

        manual_org_name = self.manual_org_name_input.text().strip()
        manual_org_id = self.manual_org_id_input.text().strip()
        if manual_org_name and manual_org_id:
            self._set_selected_org(
                OrgNode(id=manual_org_id, name=manual_org_name),
                source_text="已恢复上次使用的手动机构",
                log_message=False,
                sync_manual_inputs=False,
            )

    def closeEvent(self, event) -> None:  # type: ignore[override]
        self.settings.setValue("download_dir", self.download_dir_input.text().strip())
        self.settings.setValue("keyword", self.keyword_input.text().strip())
        self.settings.setValue("manual_org_name", self.manual_org_name_input.text().strip())
        self.settings.setValue("manual_org_id", self.manual_org_id_input.text().strip())
        self.settings.setValue("start_page", self.page_spin.value())
        self.settings.setValue("page_size", self.size_spin.value())
        self.settings.setValue("max_pages", self.max_pages_spin.value())
        self.settings.setValue("create_subdir", self.create_subdir_checkbox.isChecked())
        self.settings.setValue("geometry", self.saveGeometry())
        self.settings.setValue("window_state", self.saveState())
        super().closeEvent(event)

    def append_log(self, message: str) -> None:
        self.logger.info(message)
        self.log_text.appendPlainText(message)

    def show_error(self, message: str) -> None:
        self.append_log(f"错误：{message}")
        QMessageBox.critical(self, "操作失败", message)

    def _create_service(self, log_callback: Callable[[str], None] | None = None) -> SGCCCrawlerService:
        return self.service_factory(log_callback)

    def _track_worker(self, worker: FunctionWorker) -> None:
        self.org_workers.add(worker)
        worker.finished.connect(partial(self.org_workers.discard, worker))

    def _load_org_roots(self) -> None:
        self.append_log("开始加载机构根节点。")
        worker = FunctionWorker(lambda: self._create_service().load_org_roots())
        worker.completed.connect(self.populate_root_nodes)
        worker.failed.connect(self.on_org_root_load_failed)
        self._track_worker(worker)
        worker.start()

    def populate_root_nodes(self, nodes: list[OrgNode]) -> None:
        self.org_tree.clear()
        if not nodes:
            placeholder = QTreeWidgetItem(["机构接口未返回数据，可使用下方手动补偿"])
            placeholder.setData(0, PLACEHOLDER_ROLE, True)
            placeholder.setFlags(Qt.ItemIsEnabled)
            self.org_tree.addTopLevelItem(placeholder)
            self.append_log("机构根节点为空，请使用手动填写 orgId / orgName。")
            self.statusBar().showMessage("机构接口没有返回机构数据，可直接手动填写机构信息")
            return
        for node in nodes:
            self.org_tree.addTopLevelItem(self._build_org_item(node))
        self.append_log(f"机构根节点加载完成，共 {len(nodes)} 个。")

    def _build_org_item(self, node: OrgNode) -> QTreeWidgetItem:
        item = QTreeWidgetItem([node.name])
        item.setData(0, Qt.UserRole, node)
        item.setData(0, LOADED_ROLE, False)
        if node.has_children:
            placeholder = QTreeWidgetItem(["加载中..."])
            placeholder.setData(0, PLACEHOLDER_ROLE, True)
            item.addChild(placeholder)
        return item

    def on_org_item_expanded(self, item: QTreeWidgetItem) -> None:
        node = item.data(0, Qt.UserRole)
        if not isinstance(node, OrgNode):
            return
        if item.data(0, LOADED_ROLE):
            return
        if item.childCount() == 0:
            return
        first_child = item.child(0)
        if not first_child.data(0, PLACEHOLDER_ROLE):
            item.setData(0, LOADED_ROLE, True)
            return

        worker = FunctionWorker(lambda: self._create_service().load_org_children(node.id))
        worker.completed.connect(partial(self.populate_child_nodes, item))
        worker.failed.connect(self.show_error)
        self._track_worker(worker)
        worker.start()

    def populate_child_nodes(self, parent_item: QTreeWidgetItem, nodes: list[OrgNode]) -> None:
        parent_item.takeChildren()
        if not nodes:
            placeholder = QTreeWidgetItem(["未返回子节点，可直接手动填写机构"])
            placeholder.setData(0, PLACEHOLDER_ROLE, True)
            placeholder.setFlags(Qt.ItemIsEnabled)
            parent_item.addChild(placeholder)
            parent_item.setData(0, LOADED_ROLE, True)
            self.append_log("机构子节点为空，可继续使用手动补偿。")
            return
        for node in nodes:
            parent_item.addChild(self._build_org_item(node))
        parent_item.setData(0, LOADED_ROLE, True)
        self.append_log(f"加载机构子节点完成，共 {len(nodes)} 个。")

    def on_org_tree_selection_changed(self) -> None:
        items = self.org_tree.selectedItems()
        if not items:
            return
        if items[0].data(0, PLACEHOLDER_ROLE):
            return
        node = items[0].data(0, Qt.UserRole)
        if isinstance(node, OrgNode):
            self._set_selected_org(node, source_text="已选择机构")

    def search_orgs(self) -> None:
        keyword = self.org_search_input.text().strip()
        if not keyword:
            self.show_error("请输入机构搜索关键字。")
            return
        self.append_log(f"开始搜索机构：{keyword}")
        worker = FunctionWorker(lambda: self._create_service().search_orgs(keyword))
        worker.completed.connect(self.populate_search_results)
        worker.failed.connect(self.on_org_search_failed)
        self._track_worker(worker)
        worker.start()

    def populate_search_results(self, nodes: list[OrgNode]) -> None:
        self.org_result_list.clear()
        if not nodes:
            placeholder = QListWidgetItem("未找到机构，可手动填写 orgId / orgName")
            placeholder.setFlags(Qt.NoItemFlags)
            self.org_result_list.addItem(placeholder)
            self.append_log("机构搜索无结果，请使用手动补偿。")
            self.statusBar().showMessage("机构搜索无结果，可手动填写机构信息")
            return
        for node in nodes:
            item = QListWidgetItem(f"{node.name} ({node.id})")
            item.setData(Qt.UserRole, node)
            self.org_result_list.addItem(item)
        self.append_log(f"机构搜索完成，共 {len(nodes)} 个结果。")

    def on_org_search_item_clicked(self, item: QListWidgetItem) -> None:
        node = item.data(Qt.UserRole)
        if isinstance(node, OrgNode):
            self._set_selected_org(node, source_text="已通过搜索选择机构")

    def apply_manual_org_selection(self) -> None:
        org_name = self.manual_org_name_input.text().strip()
        org_id = self.manual_org_id_input.text().strip()
        if not org_name or not org_id:
            self.show_error("请同时填写机构名称和机构 ID。")
            return

        self.org_tree.clearSelection()
        self.org_result_list.clearSelection()
        self._set_selected_org(
            OrgNode(id=org_id, name=org_name, raw={"source": "manual"}),
            source_text="已使用手动机构",
            sync_manual_inputs=False,
        )
        self.statusBar().showMessage(f"当前使用手动机构：{org_name} ({org_id})")

    def _set_selected_org(
        self,
        node: OrgNode,
        *,
        source_text: str,
        log_message: bool = True,
        sync_manual_inputs: bool = True,
    ) -> None:
        self.selected_org = node
        self.selected_org_label.setText(f"当前机构：{node.name} ({node.id})")
        if sync_manual_inputs:
            self.manual_org_name_input.setText(node.name)
            self.manual_org_id_input.setText(node.id)
        if log_message:
            self.append_log(f"{source_text}：{node.name} ({node.id})")

    def _show_org_fallback_warning(self, title: str, message: str) -> None:
        detail = f"{message}\n\n你仍然可以在左侧“手动补偿”中直接填写 orgName 和 orgId 后继续查询。"
        self.append_log(f"{title}：{message}")
        self.statusBar().showMessage("机构接口异常，可使用手动补偿继续查询")
        QMessageBox.warning(self, title, detail)

    def on_org_root_load_failed(self, message: str) -> None:
        self.org_tree.clear()
        placeholder = QTreeWidgetItem(["机构树加载失败，可使用下方手动补偿"])
        placeholder.setData(0, PLACEHOLDER_ROLE, True)
        placeholder.setFlags(Qt.ItemIsEnabled)
        self.org_tree.addTopLevelItem(placeholder)
        self._show_org_fallback_warning("机构树加载失败", message)

    def on_org_search_failed(self, message: str) -> None:
        self.org_result_list.clear()
        placeholder = QListWidgetItem("机构搜索失败，可手动填写 orgId / orgName")
        placeholder.setFlags(Qt.NoItemFlags)
        self.org_result_list.addItem(placeholder)
        self._show_org_fallback_warning("机构搜索失败", message)

    def choose_download_directory(self) -> None:
        current = self.download_dir_input.text().strip() or str(default_download_root())
        selected = QFileDialog.getExistingDirectory(self, "选择下载目录", current)
        if selected:
            self.download_dir_input.setText(selected)

    def reset_download_directory(self) -> None:
        self.download_dir_input.setText(str(default_download_root()))

    def _set_task_controls(self, running: bool) -> None:
        self.query_button.setEnabled(not running)
        self.download_button.setEnabled(not running)
        self.stop_button.setEnabled(running)

    def _update_selection_summary(self) -> None:
        self.total_label.setText(str(len(self.table_model.records)))
        self.selected_label.setText(str(len(self.table_model.selected_records())))

    def preview_attachments(self) -> None:
        if not self.selected_org:
            self.show_error("请先选择机构。")
            return

        params = SearchParams(
            org_id=self.selected_org.id,
            org_name=self.selected_org.name,
            keyword=self.keyword_input.text().strip(),
            start_page=self.page_spin.value(),
            page_size=self.size_spin.value(),
            max_pages=self.max_pages_spin.value(),
        )

        self.task_cancel_token = CancelToken()
        self.task_worker = PreviewWorker(self._create_service, params, self.task_cancel_token)
        self.task_worker.progress.connect(self.on_task_progress)
        self.task_worker.log.connect(self.append_log)
        self.task_worker.completed.connect(self.on_preview_completed)
        self.task_worker.failed.connect(self.on_task_failed)
        self.task_worker.cancelled.connect(self.on_task_cancelled)
        self._set_task_controls(True)
        self.progress_label.setText("开始查询公告...")
        self.progress_bar.setRange(0, max(1, params.max_pages))
        self.progress_bar.setValue(0)
        self.task_worker.start()

    def on_preview_completed(self, records: list[AttachmentRecord]) -> None:
        self.table_model.set_records(records)
        self._update_selection_summary()
        self._set_task_controls(False)
        self.task_worker = None
        self.task_cancel_token = None
        self.progress_label.setText(f"预览完成，共 {len(records)} 个附件")
        self.progress_bar.setValue(self.progress_bar.maximum())
        self.append_log(f"预览完成，共 {len(records)} 个附件。")

    def download_selected(self) -> None:
        if not self.table_model.selected_records():
            self.show_error("请先勾选要下载的附件。")
            return

        target_dir = self.download_dir_input.text().strip() or str(default_download_root())
        self.download_dir_input.setText(target_dir)

        self.task_cancel_token = CancelToken()
        self.task_worker = DownloadWorker(
            self._create_service,
            self.table_model.records,
            target_dir,
            self.create_subdir_checkbox.isChecked(),
            self.task_cancel_token,
        )
        self.task_worker.progress.connect(self.on_task_progress)
        self.task_worker.log.connect(self.append_log)
        self.task_worker.completed.connect(self.on_download_completed)
        self.task_worker.failed.connect(self.on_task_failed)
        self.task_worker.cancelled.connect(self.on_task_cancelled)
        self._set_task_controls(True)
        self.progress_bar.setRange(0, max(1, len(self.table_model.selected_records())))
        self.progress_bar.setValue(0)
        self.progress_label.setText("开始下载附件...")
        self.task_worker.start()

    def on_download_completed(self, result: DownloadResult) -> None:
        self.last_result_dir = result.target_dir
        self.table_model.refresh()
        self._update_selection_summary()
        self._set_task_controls(False)
        self.task_worker = None
        self.task_cancel_token = None
        self.progress_label.setText(
            f"下载完成，成功 {result.success_count} 个，失败 {result.failure_count} 个"
        )
        self.progress_bar.setValue(self.progress_bar.maximum())
        self.append_log(f"下载完成，目录：{result.target_dir}")
        self.statusBar().showMessage(f"下载完成：{result.target_dir}")

    def on_task_progress(self, progress: TaskProgress) -> None:
        maximum = max(progress.total, 1)
        self.progress_bar.setRange(0, maximum)
        self.progress_bar.setValue(min(progress.current, maximum))
        self.progress_label.setText(progress.message)
        self.table_model.refresh()
        self._update_selection_summary()

    def on_task_failed(self, message: str) -> None:
        self._set_task_controls(False)
        self.task_worker = None
        self.task_cancel_token = None
        self.table_model.refresh()
        self._update_selection_summary()
        self.show_error(message)

    def on_task_cancelled(self, message: str) -> None:
        self._set_task_controls(False)
        self.task_worker = None
        self.task_cancel_token = None
        self.table_model.refresh()
        self._update_selection_summary()
        self.append_log(message)
        self.progress_label.setText(message)
        self.statusBar().showMessage(message)

    def stop_current_task(self) -> None:
        if self.task_cancel_token:
            self.task_cancel_token.cancel()
            self.append_log("已请求停止当前任务。")

    def select_all_records(self) -> None:
        self.table_model.select_all(True)
        self._update_selection_summary()

    def invert_records(self) -> None:
        self.table_model.invert_selection()
        self._update_selection_summary()

    def open_download_directory(self) -> None:
        candidate = self.download_dir_input.text().strip() or str(default_download_root())
        target = self.last_result_dir if self.last_result_dir.exists() else Path(candidate)
        if not target.exists():
            self.show_error("下载目录不存在。")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(target)))

    def open_log_directory(self) -> None:
        log_file = getattr(self.logger.handlers[0], "baseFilename", "")
        if not log_file:
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(Path(log_file).parent)))
