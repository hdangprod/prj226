import { NotionSecondBrainClient } from '../notion/client';
import { geminiAssistant } from '../gemini/client';

export interface WeeklyReport {
  slippageRate: number; // percentage
  velocityScore: number; // hours
  discoveryPercent: number; // percentage
  deliveryPercent: number; // percentage
  totalTasks: number;
  completedTasks: number;
  slippageTasks: number;
}

export class ReportService {
  private notionClient: NotionSecondBrainClient;

  constructor() {
    this.notionClient = new NotionSecondBrainClient();
  }

  /**
   * Compiles the weekly performance report using tasks data and Gemini classification
   */
  public async compileWeeklyReport(): Promise<WeeklyReport> {
    const tasks = await this.notionClient.fetchWeeklyTasksForReport();

    const totalTasks = tasks.length;
    if (totalTasks === 0) {
      return {
        slippageRate: 0,
        velocityScore: 0,
        discoveryPercent: 0,
        deliveryPercent: 0,
        totalTasks: 0,
        completedTasks: 0,
        slippageTasks: 0
      };
    }

    // 1. Calculate Slippage Rate (tasks with '[Rollover]' prefix)
    const slippageTasksList = tasks.filter(task => task.name.startsWith('[Rollover]'));
    const slippageTasks = slippageTasksList.length;
    const slippageRate = parseFloat(((slippageTasks / totalTasks) * 100).toFixed(1));

    // 2. Calculate Velocity Score (sum of estimate of Completed tasks)
    const completedTasksList = tasks.filter(task => task.status === 'Done');
    const completedTasks = completedTasksList.length;
    const velocityScore = parseFloat(
      completedTasksList.reduce((sum, task) => sum + task.estimate, 0).toFixed(2)
    );

    // 3. PM Framework Analysis (Discovery vs Delivery split)
    // Extract unique task names for classification
    const taskNames = tasks.map(t => t.name);
    const classifications = await geminiAssistant.classifyTasksDiscoveryDelivery(taskNames);

    let discoveryHours = 0;
    let deliveryHours = 0;

    for (const task of tasks) {
      const match = classifications.find(c => c.name === task.name);
      const type = match ? match.type : 'Delivery'; // default to Delivery if unmatched

      if (type === 'Discovery') {
        discoveryHours += task.estimate;
      } else {
        deliveryHours += task.estimate;
      }
    }

    const totalHours = discoveryHours + deliveryHours;
    let discoveryPercent = 0;
    let deliveryPercent = 0;

    if (totalHours > 0) {
      discoveryPercent = parseFloat(((discoveryHours / totalHours) * 100).toFixed(1));
      deliveryPercent = parseFloat(((deliveryHours / totalHours) * 100).toFixed(1));
    } else {
      // Fallback if no estimates exist
      discoveryPercent = 50;
      deliveryPercent = 50;
    }

    return {
      slippageRate,
      velocityScore,
      discoveryPercent,
      deliveryPercent,
      totalTasks,
      completedTasks,
      slippageTasks
    };
  }

  /**
   * Renders a pretty Markdown report for Telegram
   */
  public async getWeeklyReportMessage(): Promise<string> {
    try {
      const report = await this.compileWeeklyReport();
      
      const todayStr = this.notionClient.getLocalDateString();

      return `📊 *BÁO CÁO HIỆU SUẤT HÀNG TUẦN*
📅 _Ngày xuất báo cáo: ${todayStr}_

📋 *Thống kê tổng quan:*
- Tổng số Task lên lịch: ${report.totalTasks}
- Task đã hoàn thành: ${report.completedTasks}
- Task bị hoãn/reschedule: ${report.slippageTasks}

🎯 *Chỉ số hiệu năng:*
- *Slippage Rate (Tỷ lệ trượt)*: ${report.slippageRate}%
  _(Mục tiêu: càng thấp càng tốt, phản ánh mức độ hoàn thành kế hoạch đúng hạn)_
- *Velocity Score (Năng suất)*: ${report.velocityScore}h tích lũy
  _(Tổng số giờ làm việc hiệu quả được ghi nhận từ các task đã đóng)_

⚙️ *Phân tích nỗ lực (PM Framework):*
- 🔍 *Product Discovery*: ${report.discoveryPercent}%
  _(Nghiên cứu, thiết kế, lên kế hoạch)_
- 🚀 *Product Delivery*: ${report.deliveryPercent}%
  _(Viết code, lập trình, kiểm thử, sửa lỗi)_

💡 _Liam khuyên Sếp: ${
        report.slippageRate > 40
          ? 'Tỷ lệ trượt tuần này hơi cao (>40%). Tuần tới Sếp nên giảm bớt số lượng task hoặc chia nhỏ dự lượng (Estimate) để tránh quá tải.'
          : 'Chỉ số kiểm soát kế hoạch rất tốt! Hãy tiếp tục duy trì đà này nhé Sếp.'
      }_`;
    } catch (error: any) {
      console.error('Error generating weekly report text:', error);
      return `❌ Đã xảy ra lỗi khi tạo báo cáo tuần: ${error.message}`;
    }
  }
}

export const reportService = new ReportService();
