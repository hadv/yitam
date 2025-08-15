import PinyinService from '../services/pinyinService';

/**
 * Simple test script to verify Pinyin service functionality
 */
async function testPinyinService() {
  console.log('🧪 Testing Pinyin Service...\n');

  // Test cases with common acupoint names
  const testCases = [
    '合谷',      // Hegu (LI4)
    '足三里',    // Zusanli (ST36)
    '百会',      // Baihui (GV20)
    '神门',      // Shenmen (HE7)
    '太冲',      // Taichong (LR3)
    '印堂',      // Yintang (EX-HN3)
    '风池',      // Fengchi (GB20)
    '曲池',      // Quchi (LI11)
    '三阴交',    // Sanyinjiao (SP6)
    '内关',      // Neiguan (PC6)
  ];

  console.log('📝 Test Results:');
  console.log('================');

  for (const chineseText of testCases) {
    try {
      // Test different conversion methods
      const pinyinWithTones = PinyinService.convertToPinyin(chineseText, { style: 'tone' });
      const pinyinNormal = PinyinService.convertToNormalPinyin(chineseText);
      const pinyinNumeric = PinyinService.convertToNumericPinyin(chineseText);
      const acupointPinyin = PinyinService.generateAcupointPinyin(chineseText);
      const containsChinese = PinyinService.containsChinese(chineseText);

      console.log(`\n🔤 Chinese: ${chineseText}`);
      console.log(`   With tones: ${pinyinWithTones}`);
      console.log(`   Normal: ${pinyinNormal}`);
      console.log(`   Numeric: ${pinyinNumeric}`);
      console.log(`   Acupoint: ${acupointPinyin}`);
      console.log(`   Contains Chinese: ${containsChinese}`);
      
    } catch (error) {
      console.error(`❌ Error processing "${chineseText}":`, error);
    }
  }

  // Test edge cases
  console.log('\n🔍 Testing Edge Cases:');
  console.log('======================');

  const edgeCases = [
    '',           // Empty string
    '   ',        // Whitespace only
    'ABC',        // English only
    '123',        // Numbers only
    '合谷 LI4',   // Mixed Chinese and English
    '太冲穴',     // With 穴 (acupoint) suffix
  ];

  for (const testCase of edgeCases) {
    try {
      const result = PinyinService.generateAcupointPinyin(testCase);
      const containsChinese = PinyinService.containsChinese(testCase);
      console.log(`"${testCase}" -> "${result}" (Contains Chinese: ${containsChinese})`);
    } catch (error) {
      console.error(`❌ Error with "${testCase}":`, error);
    }
  }

  console.log('\n✅ Pinyin Service test completed!');
}

// Run the test if called directly
if (require.main === module) {
  testPinyinService().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { testPinyinService };
