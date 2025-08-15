const key = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  res.status(200).json({ apiKey: key ? "Key Loaded" : "No Key Found" });
}