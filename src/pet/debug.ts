/** 网址带 ?debug 时显示调试信息（触摸分区的蓝圈、摄像头识别数值） */
export const DEBUG = new URLSearchParams(location.search).has("debug")
