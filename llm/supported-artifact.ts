export const SUPPORTED_ARTIFACT = {
  repoId: 'Slomin/slophammer_350m',
  treeApiUrl: 'https://huggingface.co/api/models/Slomin/slophammer_350m/tree/main',
  filename: 'slophammer_350m_v0_1.zip',
  size: 215_720_009,
  sha256: '3d4f39017e0b47df6d4d3ee1d4a827f7a2eb42106fa12ed95dad4e67c0d63d4e',
  contractVersion: 'SlopHammer 350M v0.1',
  baseModel: 'LiquidAI/LFM2.5-350M-Base',
  minWords: 40,
  calibration: {
    tau: 3.8088,
    abstainBand: 1.5,
  },
  labels: ['Human', 'Lightly AI', 'Moderately AI', 'Fully AI'],
} as const

export const SUPPORTED_ARTIFACT_URL =
  `https://huggingface.co/${SUPPORTED_ARTIFACT.repoId}/resolve/main/${SUPPORTED_ARTIFACT.filename}`
