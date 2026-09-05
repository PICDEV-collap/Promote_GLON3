import { messagingApi } from '@line/bot-sdk';
import { CustomerRegistry, CustomerProfile } from './storage/customer-registry';
import { LuckyDistributor } from './dream/lucky-distributor';
import { FlexMessageBuilder } from './line/flex-message';
import { CampaignService } from './automation/campaign-service';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runCampaignTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING CAMPAIGN & DISTRIBUTED LUCKY PICKER VERIFICATION SUITE');
  console.log('================================================================');

  // -------------------------------------------------------------------------
  // Test 1: CustomerRegistry
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Testing CustomerRegistry ---');
  const registry = CustomerRegistry.getInstance();
  const testUser1 = 'U_test_customer_001';
  const testUser2 = 'U_test_customer_002';
  const testUser3 = 'U_test_customer_003';

  const p1 = registry.registerOrUpdateUser(testUser1, 'สมชาย ดวงดี');
  const p2 = registry.registerOrUpdateUser(testUser2, 'วิภา รวยทรัพย์');
  const p3 = registry.registerOrUpdateUser(testUser3, 'กิตติ มหาโชค');

  assert(p1.status === 'active', 'User 1 registered with active status');
  assert(p2.displayName === 'วิภา รวยทรัพย์', 'User 2 has correct display name');

  // Test block on unfollow
  registry.markBlocked(testUser3);
  const p3Check = registry.getCustomer(testUser3);
  assert(p3Check?.status === 'blocked', 'User 3 marked blocked after unfollow');

  // Verify active customers filter out blocked users
  const activeList = registry.getActiveCustomers();
  assert(activeList.some(c => c.userId === testUser1), 'Active list contains testUser1');
  assert(!activeList.some(c => c.userId === testUser3), 'Active list excludes blocked testUser3');

  // Re-activate user 3
  registry.registerOrUpdateUser(testUser3);
  assert(registry.getCustomer(testUser3)?.status === 'active', 'User 3 re-activated upon sending message');

  // -------------------------------------------------------------------------
  // Test 2: LuckyDistributor (Non-Colliding / Dispersed Randomization)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Testing LuckyDistributor & Collision Resistance ---');
  const dummyCustomers: CustomerProfile[] = [];
  const TOTAL_TEST_USERS = 150; // สร้างลูกค้าจำลอง 150 ราย
  for (let i = 1; i <= TOTAL_TEST_USERS; i++) {
    dummyCustomers.push({
      userId: `U_dummy_${String(i).padStart(4, '0')}`,
      displayName: `ลูกค้าคนที่ ${i}`,
      status: 'active',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      totalOrders: 0,
      assignedLuckyNumbers: {}
    });
  }

  const drawDate = '2026-09-16';
  const drawDateThai = '16 กันยายน 2569';
  const distributed = LuckyDistributor.distributeLuckyNumbers(dummyCustomers, drawDate, drawDateThai);

  assert(distributed.length === TOTAL_TEST_USERS, `Distributed exactly ${TOTAL_TEST_USERS} lucky items`);

  // ตรวจสอบว่าไม่มีเลขซ้ำกันแม้แต่ตัวเดียว (Zero-collision check)
  const numbersSet = new Set<string>();
  let hasDuplicates = false;
  for (const item of distributed) {
    assert(/^\d{3}$/.test(item.number), `Number ${item.number} is valid 3-digit format`);
    assert(/^\d{2}$/.test(item.n2), `2-digit ${item.n2} is valid format`);
    assert(item.quickOrderCommand === `${item.number}=1`, `Quick command is ${item.number}=1`);

    if (numbersSet.has(item.number)) {
      hasDuplicates = true;
      console.error(`COLLISION DETECTED: Number ${item.number} was assigned more than once!`);
    }
    numbersSet.add(item.number);
  }

  assert(!hasDuplicates, `Zero Collision Guarantee: All ${TOTAL_TEST_USERS} users received distinct unique numbers!`);
  console.log(`📊 ตัวอย่างตัวเลขที่สุ่มกระจายให้ 5 คนแรก:`);
  distributed.slice(0, 5).forEach((d, i) => {
    console.log(`   #${i+1} [${d.displayName}]: 3ตรง=${d.number} | โต๊ด=${d.tods.join(',')} | 2ตรง=${d.n2} | ${d.blessing}`);
  });

  // -------------------------------------------------------------------------
  // Test 3: Flex Message Generation & Validation
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Testing FlexMessageBuilder for Lucky Teaser & Draw Results ---');
  const sampleTeaserItem = distributed[0];
  const teaserFlex = FlexMessageBuilder.buildPersonalizedLuckyTeaserMessage(sampleTeaserItem);

  assert(teaserFlex.type === 'flex', 'Teaser message has type: flex');
  assert(teaserFlex.altText.includes(sampleTeaserItem.number), 'AltText contains lucky number');
  assert(teaserFlex.contents.type === 'bubble', 'Teaser content is bubble');

  // ตรวจสอบความยาวตัวอักษรของปุ่ม (ต้องไม่เกิน 20 ตัวอักษรตามข้อกำหนด LINE)
  const bubble1 = teaserFlex.contents as messagingApi.FlexBubble;
  const footerButtons = bubble1.footer?.contents || [];
  for (const btn of footerButtons) {
    if ((btn as any).action?.label) {
      const label = (btn as any).action.label;
      assert(label.length <= 20, `Button label "${label}" length (${label.length}) <= 20 chars`);
    }
  }

  // ทดสอบการสร้างการ์ดผลรางวัล
  const sampleLotteryData = {
    drawDate: '2026-09-01',
    drawDateThai: '1 กันยายน 2569',
    period: 'งวดประจำวันที่ 1 กันยายน 2569',
    n3: {
      straight3: { number: '212', prizeText: '5,801 บาท' },
      shuffle3: { numbers: ['122', '221'], prizeText: '2,702 บาท' },
      straight2: { number: '04', prizeText: '582 บาท' },
      specialJackpot: { ticketNumber: '212000003860', prizeText: '839,705 บาท' }
    },
    gloStandard: {
      firstPrize: { number: '417212' },
      last2: { number: '04' }
    }
  };

  const resultsFlex = FlexMessageBuilder.buildDrawResultsMessage(sampleLotteryData);
  assert(resultsFlex.type === 'flex', 'Draw results message has type: flex');
  assert(resultsFlex.altText.includes('1 กันยายน 2569'), 'AltText contains draw date');
  const bubble2 = resultsFlex.contents as messagingApi.FlexBubble;
  const resButtons = bubble2.footer?.contents || [];
  for (const btn of resButtons) {
    if ((btn as any).action?.label) {
      const label = (btn as any).action.label;
      assert(label.length <= 20, `Result button label "${label}" length (${label.length}) <= 20 chars`);
    }
  }

  // -------------------------------------------------------------------------
  // Test 4: CampaignService (Dry Run Execution)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Testing CampaignService in Dry-Run Mode ---');
  const campaignService = CampaignService.getInstance();
  const upcomingInfo = campaignService.getUpcomingDrawInfo();
  assert(!!upcomingInfo.drawDate, `Upcoming draw date detected: ${upcomingInfo.drawDate} (${upcomingInfo.thaiDate})`);

  // Dry-run teaser
  const teaserResult = await campaignService.sendPersonalizedLuckyTeasers({ dryRun: true });
  assert(teaserResult.dryRun === true, 'Teaser executed in dryRun mode');
  assert(teaserResult.sentCount > 0, `Teaser sent to ${teaserResult.sentCount} active test users in dryRun`);

  // Dry-run results
  const broadcastResult = await campaignService.broadcastDrawResults({ dryRun: true, force: true });
  assert(broadcastResult.dryRun === true, 'Draw results broadcast executed in dryRun mode');
  assert(broadcastResult.sentCount > 0, `Results sent to ${broadcastResult.sentCount} active test users in dryRun`);

  console.log('\n================================================================');
  console.log('🎉 ALL CAMPAIGN & LUCKY DISTRIBUTOR TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runCampaignTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
