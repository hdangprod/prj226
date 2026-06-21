import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const dbId = process.env.NOTION_PROJECTS_DB_ID;

async function run() {
  const response = await notion.databases.query({
    database_id: dbId!,
  });
  for (const page of response.results) {
    console.log(JSON.stringify((page as any).properties.Status, null, 2));
    console.log(JSON.stringify((page as any).properties.Name, null, 2));
  }
}
run().catch(console.error);
