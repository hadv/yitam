/**
 * List of available knowledge domains for document processing
 * These domains are focused on traditional Eastern medicine, philosophy, and spiritual practices
 */
export const availableDomains = [
  'nội kinh',
  'đông y',
  'y học cổ truyền',
  'y tông tâm lĩnh',
  'hải thượng lãn ông',
  'lê hữu trác',
  'y quán',
  'y quán đường',
  'âm dương ngũ hành',
  'dịch lý',
  'lão kinh',
  'lão tử',
  'phong thủy',
  'đạo phật',
  'thích nhất hạnh',
  'viên minh'
];

/**
 * Domain keyword mappings for fallback keyword-based detection
 */
export const domainKeywordMappings: Record<string, string[]> = {
  // Eastern Medicine domains
  'nội kinh': ['nội kinh', 'kinh lạc', 'kinh dịch', 'kinh mạch', 'y kinh', 'đạo kinh', 'châm cứu'],
  'đông y': ['đông y', 'thuốc bắc', 'thuốc nam', 'thuốc đông y', 'y học', 'dược liệu', 'dưỡng sinh', 'bắt mạch'],
  'y học cổ truyền': ['y học cổ truyền', 'y học truyền thống', 'đông y học', 'cổ phương', 'y thuật', 'tứ chẩn'],
  'y tông tâm lĩnh': ['y tông tâm lĩnh', 'y tông', 'tâm lĩnh', 'phương thuốc', 'bí truyền'],
  'hải thượng lãn ông': ['hải thượng lãn ông', 'lãn ông', 'hải thượng', 'y dược', 'châm cứu'],
  'lê hữu trác': ['lê hữu trác', 'thượng kinh ký sự', 'y phương', 'y án'],
  'y quán': ['y quán', 'quán y', 'phương thuốc', 'y thuật'],
  'y quán đường': ['y quán đường', 'quán đường', 'y học đường', 'phương chữa'],
  
  // Philosophy and cosmology domains
  'âm dương ngũ hành': ['âm dương', 'ngũ hành', 'âm dương học', 'âm dương ngũ hành', 'can chi', 'thiên can', 'địa chi'],
  'dịch lý': ['dịch lý', 'kinh dịch', 'hà đồ', 'lạc thư', 'bát quái', 'quẻ', 'càn khôn', 'chu dịch'],
  'lão kinh': ['lão kinh', 'đạo đức kinh', 'đạo kinh', 'huyền học'],
  'lão tử': ['lão tử', 'đạo gia', 'đạo giáo', 'vô vi', 'hư vô'],
  'phong thủy': ['phong thủy', 'địa lý', 'sơn thủy', 'tử vi', 'mệnh lý', 'bát tự', 'tứ trụ'],
  
  // Buddhist and spiritual domains
  'đạo phật': ['đạo phật', 'phật giáo', 'phật đà', 'thiền', 'thiền định', 'giới luật', 'tam tạng', 'bát nhã', 'kinh phật'],
  'thích nhất hạnh': ['thích nhất hạnh', 'làng mai', 'chánh niệm', 'thiền hành', 'thiền quán'],
  'viên minh': ['viên minh', 'giác ngộ', 'tuệ giác', 'định tuệ', 'thiền quán']
};

/**
 * Default domains to use when no match is found
 */
export const defaultDomains = ['đông y', 'y học cổ truyền', 'đạo phật']; 