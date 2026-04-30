export default {
  title: 'Claude History Viewer',
  description: 'Claude Code 对话历史的终极管理工具，支持 Markdown、代码高亮、主题切换和会话恢复',
  base: '/claude-history/',
  srcDir: '.',
  dest: '.vitepress/dist',
  themeConfig: {
    nav: [
      { text: '功能特性', link: '#为什么选择-claude-history-viewer' },
      { text: '截图预览', link: '#真实效果-一目了然' },
      { text: '快速开始', link: '#开始使用-claude-history-viewer' },
      { text: 'GitHub', link: 'https://github.com/your-username/claude-history-viewer' }
    ],
    sidebar: false,
    outline: false
  }
}