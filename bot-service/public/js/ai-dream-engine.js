/* ==========================================================================
   GLO N3 - AI Dream Interpreter & Numerology Engine
   Symbol Tokenizer, Astro-Numerology Algorithm, & N3 Ticket Generator
   Supports 45+ Authentic Thai Dream Categories & Contextual Number Extraction
   ========================================================================== */

const AIDreamEngine = (function () {
  // Comprehensive Thai Dream Symbols & Astro-Numerology Dictionary (45+ Categories)
  const dreamDictionary = [
    // 1. สัตว์เลื้อยคลาน & สิ่งศักดิ์สิทธิ์
    {
      keywords: ['งู', 'พญานาค', 'งูใหญ่', 'งูเขียว', 'งูเห่า', 'งูจงอ่าง', 'มังกร', 'อนันตนาคราช'],
      element: 'ธาตุน้ำ / ดาวเกตุ (๙)',
      luckyDigitsPrimary: ['5', '6', '9'],
      luckyDigitsSecondary: ['1', '8'],
      meaning: 'ฝันเห็นงูหรือพญานาค ถือเป็นนิมิตหมายมงคลยิ่งใหญ่ สื่อถึงโชคลาภก้อนโต การเจริญด้วยลาภยศและวาสนา หากเป็นคนโสดมีเกณฑ์พบพูนคู่บารมี หากเสี่ยงโชคสลาก N3 มีเกณฑ์รับโชคจากเลขตระกูล 5, 6, 9',
      blessing: 'แนะนำให้ทำบุญถวายสังฆทานน้ำดื่ม หรือร่วมสร้างอุโบสถเพื่อเปิดทิศทางโชคลาภ'
    },
    {
      keywords: ['ขี้', 'อุจจาระ', 'สาดขี้', 'เหยียบขี้', 'ขี้ใส่', 'สิ่งปฏิกูล', 'ห้องส้วม', 'อุจจาระเปรอะ'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['0', '8', '5'],
      luckyDigitsSecondary: ['7', '3'],
      meaning: 'โบราณท่านว่า ฝันเห็นอุจจาระ จับขี้ หรือสัมผัสสิ่งปฏิกูล ถือเป็นนิมิตโชคลาภเงินทองมหาศาลทับตัว ยิ่งฝันว่าเปรอะเปื้อนตัว ยิ่งสื่อถึงเงินทองไหลมาเทมา ทรัพย์สินเพิ่มพูนอย่างไม่คาดฝัน',
      blessing: 'แนะนำทำบุญบริจาคค่าน้ำประปา หรือทำความสะอาดลานวัดเพื่อต้อนรับทรัพย์ใหญ่'
    },
    {
      keywords: ['พระ', 'เหรียญพระ', 'พระพุทธรูป', 'วัด', 'พระสงฆ์', 'เกจิ', 'สามเณร', 'โบสถ์', 'หลวงพ่อ', 'พระเครื่อง'],
      element: 'ธาตุไฟ / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['9', '8', '5'],
      luckyDigitsSecondary: ['1', '7'],
      meaning: 'ฝันเห็นพระสงฆ์ พระพุทธรูป หรือสถานที่ศักดิ์สิทธิ์ เป็นนิมิตมงคลแห่งการปกปักรักษาและเมตตามหานิยม เทพยดาอารักษ์กำลังอำนวยพร ความเจ็บไข้จะหาย สิ่งมืดมัวจะสว่างไสว',
      blessing: 'แนะนำตักบาตรเช้าหรือร่วมทำบุญค่าน้ำค่าไฟวัด เสริมบารมีรับโชคใหญ่ N3'
    },
    {
      keywords: ['ปลา', 'จับปลา', 'ปลาทอง', 'ช้อนปลา', 'ปลาตัวใหญ่', 'แหจับปลา', 'ตกปลา', 'ฝูงปลา'],
      element: 'ธาตุน้ำ / ดาวจันทร์ (๒)',
      luckyDigitsPrimary: ['8', '7', '2'],
      luckyDigitsSecondary: ['3', '6'],
      meaning: 'ฝันว่าจับปลาได้จำนวนมาก หรือเห็นปลาแหวกว่ายอย่างสมบูรณ์ สื่อถึงการไหลมาเทมาของเงินทองและโภคทรัพย์ เป็นช่วงดวงชะตารับโชค N3 เด่นชัดอย่างยิ่ง',
      blessing: 'แนะนำปล่อยปลาหน้าแผง หรือทำบุญไถ่ชีวิตสัตว์เพื่อสะสมทุนบุญ'
    },
    {
      keywords: ['น้ำ', 'น้ำท่วม', 'ทะเล', 'แม่น้ำ', 'น้ำตก', 'ฝนตก', 'น้ำใส', 'จมน้ำ', 'คลื่นยักษ์'],
      element: 'ธาตุน้ำ / ดาวจันทร์ (๒)',
      luckyDigitsPrimary: ['2', '4', '8'],
      luckyDigitsSecondary: ['0', '6'],
      meaning: 'ฝันเห็นน้ำท่วม น้ำไหล หรือทะเลกว้างใหญ่ หมายถึงการไหลวนของทรัพย์สมบัติ การงานราบรื่น ปัญหาอุปสรรคจะถูกชะล้างไปพร้อมโชคลาภที่พัดพาเข้ามา',
      blessing: 'แนะนำบริจาคค่าน้ำประปาวัด หรือบริจาคเครื่องดื่มให้คนยากไร้'
    },
    {
      keywords: ['ไฟ', 'ไฟไหม้', 'เพลิง', 'ควัน', 'เถ้าถ่าน', 'ไฟลุก', 'กองไฟ'],
      element: 'ธาตุไฟ / ดาวอาทิตย์ (๑)',
      luckyDigitsPrimary: ['1', '4', '0'],
      luckyDigitsSecondary: ['7', '3'],
      meaning: 'ฝันเห็นไฟไหม้ หรือแสงเพลิงสว่างไสว สื่อถึงการผันเปลี่ยนดวงชะตาจากร้ายกลายเป็นดี โชคลาภจะเข้ามาอย่างรวดเร็วฉับพลันแบบไม่คาดฝัน',
      blessing: 'แนะนำเติมน้ำมันตะเกียง หรือถวายหลอดไฟสังฆทานเพื่อเพิ่มความสว่างไสวในดวงชะตา'
    },
    {
      keywords: ['ศพ', 'คนตาย', 'โลงศพ', 'งานศพ', 'กระดูก', 'วิญญาณ', 'ผี', 'ซากศพ', 'สุสาน'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['0', '4', '7'],
      luckyDigitsSecondary: ['6', '9'],
      meaning: 'โบราณว่าฝันเห็นศพ คนตาย หรืองานศพ ถือเป็นโชคใหญ่ตรงข้ามกับภาพที่เห็น สื่อถึงการหมดเคราะห์ การต่ออายุวัฒนะ และจะได้ลาภลอยจากการเสี่ยงโชคสลาก N3',
      blessing: 'แนะนำบริจาคเงินซื้อโลงศพไร้ญาติ หรือทำบุญผ้าห่อศพ'
    },
    {
      keywords: ['เด็ก', 'อุ้มเด็ก', 'คลอดบุตร', 'เด็กทารก', 'เด็กผู้ชาย', 'เด็กผู้หญิง', 'ลูกแฝด'],
      element: 'ธาตุลม / ดาวพุธ (๔)',
      luckyDigitsPrimary: ['3', '1', '7'],
      luckyDigitsSecondary: ['4', '9'],
      meaning: 'ฝันเห็นเด็กทารก หรือได้อุ้มเด็ก สื่อถึงข่าวดี นิมิตใหม่ การเริ่มต้นโครงการที่จะสร้างผลกำไรมหัศจรรย์ และมักให้โชคลาภบริสุทธิ์',
      blessing: 'แนะนำบริจาคสิ่งของให้มูลนิธิเด็กอ่อน หรือมอบทุนการศึกษา'
    },
    {
      keywords: ['รถ', 'รถยนต์', 'ขับรถ', 'รถชน', 'ขี่มอเตอร์ไซค์', 'ทะเบียนรถ', 'ยานพาหนะ'],
      element: 'ธาตุลม / ดาวอังคาร (๓)',
      luckyDigitsPrimary: ['4', '7', '3'],
      luckyDigitsSecondary: ['2', '8'],
      meaning: 'ฝันเกี่ยวกับยานพาหนะ การเดินทาง หรือรถยนต์ สื่อถึงการเคลื่อนไหวของดวงชะตา การปรับเปลี่ยนตำแหน่งหน้าที่การงาน และมักเชื่อมโยงกับตัวเลขใกล้ตัว',
      blessing: 'แนะนำกรวดน้ำให้เจ้ากรรมนายเวรและเทวดารักษาตัวยานพาหนะ'
    },
    {
      keywords: ['บ้าน', 'สร้างบ้าน', 'บ้านใหม่', 'หลังคา', 'ห้องนอน', 'บ้านไม้', 'ซื้อบ้าน'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['5', '9', '4'],
      luckyDigitsSecondary: ['1', '6'],
      meaning: 'ฝันเกี่ยวกับบ้าน หรือเคหสถาน สื่อถึงความมั่นคงในชีวิต ทรัพย์สินเงินทองที่จะเพิ่มพูนแน่นหนา มีเกณฑ์ได้รับโชคจากที่อยู่อาศัย',
      blessing: 'แนะนำกวาดลานวัด หรือร่วมสร้างอาคารสาธารณประโยชน์'
    },
    {
      keywords: ['ช้าง', 'ขี่ช้าง', 'ช้างเผือก', 'งาช้าง', 'โขลงช้าง', 'ลูกช้าง'],
      element: 'ธาตุดิน / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['9', '3', '1'],
      luckyDigitsSecondary: ['5', '7'],
      meaning: 'ฝันเห็นช้าง สัตว์ใหญ่ทรงพลัง สื่อถึงการได้รับความเมตตาจากผู้ใหญ่ การได้มงคลวาสนาสูงส่ง ประสบความสำเร็จในลาภยศและชื่อเสียง',
      blessing: 'แนะนำให้อาหารสัตว์ หรือทำบุญศูนย์อนุรักษ์ช้างไทย'
    },
    {
      keywords: ['เสือ', 'สิงโต', 'สัตว์ร้าย', 'เสือโคร่ง', 'เสือดาว'],
      element: 'ธาตุไฟ / ดาวอังคาร (๓)',
      luckyDigitsPrimary: ['3', '8', '1'],
      luckyDigitsSecondary: ['4', '7'],
      meaning: 'ฝันเห็นเสือ หรือสัตว์น่าเกรงขาม สื่อถึงพลังอำนาจ ชัยชนะเหนืออุปสรรคทั้งปวง และการได้รับโชคลาภจากการเสี่ยงโชคก้อนใหญ่',
      blessing: 'แนะนำไหว้ศาลเจ้าพ่อเสือ หรือทำบุญไถ่ชีวิตโคกระบือ'
    },
    {
      keywords: ['จระเข้', 'ไอ้เข้', 'จระเข้ยักษ์'],
      element: 'ธาตุน้ำ / ดาวราหู (๘)',
      luckyDigitsPrimary: ['8', '7', '0'],
      luckyDigitsSecondary: ['2', '4'],
      meaning: 'ฝันเห็นจระเข้ สื่อถึงการมีผู้ใหญ่คอยให้ความคุ้มครอง หรือต้องระวังคำพูด แต่ในด้านเสี่ยงโชคถือเป็นสัตว์น้ำเจ้าพระยา นำลาภก้อนโตมาให้',
      blessing: 'แนะนำทำบุญปล่อยปลา หรือไถ่ชีวิตสัตว์น้ำ'
    },
    {
      keywords: ['สุนัข', 'หมา', 'แมว', 'สัตว์เลี้ยง', 'ลูกแมว', 'ลูกหมา'],
      element: 'ธาตุลม / ดาวพุธ (๔)',
      luckyDigitsPrimary: ['4', '7', '2'],
      luckyDigitsSecondary: ['5', '8'],
      meaning: 'ฝันเห็นสุนัขหรือแมว สื่อถึงมิตรบริวารนำโชค ความจงรักภักดี และข่าวดีจากญาติมิตรใกล้ชิดที่จะนำพาโชคลาภมาให้',
      blessing: 'แนะนำบริจาคอาหารสัตว์พิการหรือสุนัขจรจัด'
    },
    {
      keywords: ['เงิน', 'ทอง', 'ธนบัตร', 'แหวนทอง', 'สมบัติ', 'แก้วแหวนเงินทอง', 'เหรียญทอง', 'สร้อยทอง'],
      element: 'ธาตุทอง / ดาวศุกร์ (๖)',
      luckyDigitsPrimary: ['6', '2', '9'],
      luckyDigitsSecondary: ['5', '8'],
      meaning: 'ฝันว่าได้รับเงิน ได้ทองคำ หรือขุดพบทรัพย์สมบัติ สื่อถึงการได้รับลาภลอยอย่างตรงไปตรงมา ลาภลอยจากการเสี่ยงโชคสลาก N3 เด่นชัดอย่างยิ่ง',
      blessing: 'แนะนำอธิษฐานจิตแบ่งปันทานบารมีเมื่อได้รับโชคใหญ่'
    },

    // 2. สัตว์มงคล & สัตว์อื่นๆ
    {
      keywords: ['เต่า', 'ตะพาบ', 'เต่ายักษ์', 'เต่าคลาน'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['4', '3', '1'],
      luckyDigitsSecondary: ['5', '7'],
      meaning: 'ฝันเห็นเต่า สัตว์มงคลอายุวัฒนะ สื่อถึงความมั่นคง สุขภาพแข็งแรง อายุยืนยาว และจะได้ลาภลอยอย่างช้าๆ แต่มั่นคงถาวร',
      blessing: 'แนะนำทำบุญปล่อยเต่า หรือปล่อยปลาหน้าเขียง'
    },
    {
      keywords: ['ไก่', 'นก', 'เป็ด', 'ห่าน', 'นกอินทรี', 'ลูกเจี๊ยบ'],
      element: 'ธาตุลม / ดาวอาทิตย์ (๑)',
      luckyDigitsPrimary: ['1', '9', '2'],
      luckyDigitsSecondary: ['7', '4'],
      meaning: 'ฝันเห็นไก่หรือนก สื่อถึงการทำมาหากินคล่องแคล่ว มีโชคลาภจากการเจรจาค้าขาย ปีกนกโบยบินนำข่าวดีมาสู่บ้านเรือน',
      blessing: 'แนะนำให้อาหารนก หรือบริจาคทานอาหารแห้งแก่คนยากไร้'
    },
    {
      keywords: ['วัว', 'ควาย', 'ลูกวัว', 'ฝูงวัว', 'กระบือ'],
      element: 'ธาตุดิน / ดาวอังคาร (๓)',
      luckyDigitsPrimary: ['4', '8', '2'],
      luckyDigitsSecondary: ['3', '6'],
      meaning: 'ฝันเห็นวัวหรือควาย สื่อถึงความอดทนและความอุดมสมบูรณ์ สิ่งที่ลงแรงทำไว้จะเริ่มผลิดอกออกผลเป็นเงินทองก้อนใหญ่',
      blessing: 'แนะนำร่วมบุญไถ่ชีวิตโค-กระบือ เสริมดวงชะตาชีวิต'
    },
    {
      keywords: ['ม้า', 'ขี่ม้า', 'ลูกม้า', 'ม้าขาว', 'ม้าแข่ง'],
      element: 'ธาตุไฟ / ดาวอังคาร (๓)',
      luckyDigitsPrimary: ['7', '8', '4'],
      luckyDigitsSecondary: ['1', '9'],
      meaning: 'ฝันเห็นม้า หรือขี่ม้า สื่อถึงความรวดเร็ว ว่องไว ความก้าวหน้าในหน้าที่การงาน และจะมีโชคลาภหลั่งไหลเข้ามาอย่างทันอกทันใจ',
      blessing: 'แนะนำร่วมบริจาคยานพาหนะช่วยผู้ป่วย หรือค่าน้ำมันรถกู้ภัย'
    },
    {
      keywords: ['หมู', 'ลูกหมู', 'ฝูงหมู', 'แม่หมู'],
      element: 'ธาตุดิน / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['0', '8', '9'],
      luckyDigitsSecondary: ['2', '5'],
      meaning: 'ฝันเห็นหมู สื่อถึงความอุดมสมบูรณ์ ทำสิ่งใดก็สำเร็จง่ายดายดั่งหมูๆ เงินทองไหลมาเทมาไม่ขาดมือ มีเกณฑ์รับโชคใหญ่',
      blessing: 'แนะนำบริจาคอาหารให้เด็กกำพร้า หรือโรงทานวัด'
    },
    {
      keywords: ['กุ้ง', 'ปู', 'หอย', 'ปลาหมึก', 'อาหารทะเล'],
      element: 'ธาตุน้ำ / ดาวจันทร์ (๒)',
      luckyDigitsPrimary: ['9', '8', '5'],
      luckyDigitsSecondary: ['2', '7'],
      meaning: 'ฝันเห็นกุ้ง ปู หอย สัตว์น้ำมีเปลือก สื่อถึงทรัพย์สินที่ซ่อนเร้น การเก็บหอมรอมริบจะงอกเงย และจะได้ลาภลอยแบบเซอร์ไพรส์',
      blessing: 'แนะนำทำบุญบริจาคทานน้ำดื่มสะอาด'
    },
    {
      keywords: ['กบ', 'เขียด', 'คางคก', 'อึ่งอ่าง'],
      element: 'ธาตุน้ำ / ดาวเกตุ (๙)',
      luckyDigitsPrimary: ['1', '9', '4'],
      luckyDigitsSecondary: ['8', '2'],
      meaning: 'ฝันเห็นกบหรือเขียด สื่อถึงการกระโดดก้าวหน้าในชีวิต จะมีโชคลาภติดๆ กันหลายงวด เงินทองเพิ่มพูนอย่างก้าวกระโดด',
      blessing: 'แนะนำทำบุญค่าน้ำค่าไฟวัดเพื่อเปิดทางโชคลาภ'
    },
    {
      keywords: ['ตะขาบ', 'แมงป่อง', 'แมงมุม', 'สัตว์มีพิษ'],
      element: 'ธาตุไฟ / ดาวราหู (๘)',
      luckyDigitsPrimary: ['8', '9', '6'],
      luckyDigitsSecondary: ['7', '1'],
      meaning: 'ฝันเห็นสัตว์มีพิษ โบราณว่าพิษร้ายจะแปรเปลี่ยนเป็นมหาลาภ ศัตรูจะกลายเป็นมิตร และมีเกณฑ์ได้รับเงินทองก้อนโตจากการเสี่ยงโชค',
      blessing: 'แนะนำสวดมนต์แผ่เมตตาให้สรรพสัตว์และเจ้ากรรมนายเวร'
    },
    {
      keywords: ['จิ้งจก', 'ตุ๊กแก', 'กิ้งก่า'],
      element: 'ธาตุลม / ดาวพุธ (๔)',
      luckyDigitsPrimary: ['7', '1', '4'],
      luckyDigitsSecondary: ['2', '8'],
      meaning: 'ฝันเห็นจิ้งจกหรือตุ๊กแกร้องทัก สื่อถึงลางบอกเหตุแห่งโชคลาภ จะมีผู้นำข่าวดีทางการเงินและโชคลาภมาบอกถึงหน้าบ้าน',
      blessing: 'แนะนำทำบุญใส่บาตรอุทิศกุศลแด่เทวดารักษาเคหสถาน'
    },
    {
      keywords: ['ผึ้ง', 'ต่อ', 'แตน', 'รังผึ้ง', 'น้ำผึ้ง'],
      element: 'ธาตุไฟ / ดาวศุกร์ (๖)',
      luckyDigitsPrimary: ['7', '8', '5'],
      luckyDigitsSecondary: ['6', '3'],
      meaning: 'ฝันเห็นผึ้งหรือรังผึ้ง สื่อถึงความหวานชื่น ความขยันขันแข็งที่จะก่อให้เกิดผลลัพธ์มหาศาล และมีโชคลาภเงินทองหลั่งไหลเข้ามาดั่งน้ำผึ้งรวง',
      blessing: 'แนะนำทำบุญถวายเทียนพรรษาหรือหลอดไฟวัด'
    },

    // 3. สรีระ ร่างกาย & ลางสังหรณ์
    {
      keywords: ['ฟันหัก', 'ฟันหลุด', 'ฟันโยก', 'ถอนฟัน', 'ฟันร่วง'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['0', '7', '3'],
      luckyDigitsSecondary: ['4', '8'],
      meaning: 'โบราณว่าฝันเห็นฟันหักเป็นการเตือนสติ แต่ในด้านศาสตร์ตัวเลขคือการสะเดาะเคราะห์ใหญ่ ทิ้งความทุกข์แล้วรับโชคก้อนโตกลับมาทดแทน',
      blessing: 'แนะนำทำบุญปล่อยสัตว์ หรือบริจาคเลือดเพื่อแก้เคล็ดเปลี่ยนร้ายเป็นมหาโชค'
    },
    {
      keywords: ['ตั้งครรภ์', 'ท้อง', 'มีลูก', 'คลอดลูก', 'ตั้งท้อง'],
      element: 'ธาตุน้ำ / ดาวศุกร์ (๖)',
      luckyDigitsPrimary: ['6', '7', '4'],
      luckyDigitsSecondary: ['2', '9'],
      meaning: 'ฝันว่าตั้งครรภ์หรือคลอดบุตร สื่อถึงการถือกำเนิดสิ่งใหม่ ความเจริญรุ่งเรือง และการรอคอยสิ่งใดจะประสบผลสำเร็จพร้อมรับทรัพย์ใหญ่',
      blessing: 'แนะนำทำบุญบริจาคทุนการศึกษาเด็ก หรือของใช้แม่และเด็ก'
    },
    {
      keywords: ['แต่งงาน', 'เจ้าสาว', 'เจ้าบ่าว', 'งานแต่ง', 'ชุดแต่งงาน'],
      element: 'ธาตุน้ำ / ดาวศุกร์ (๖)',
      luckyDigitsPrimary: ['2', '6', '9'],
      luckyDigitsSecondary: ['1', '8'],
      meaning: 'ฝันว่าแต่งงานหรือเห็นงานแต่ง สื่อถึงการร่วมทุนที่สำเร็จ ความสัมพันธ์ที่ดี และจะได้ลาภลอยจากบุคคลเพศตรงข้ามหรือคนรัก',
      blessing: 'แนะนำถวายดอกไม้ของหอมแก่พระประธานในโบสถ์'
    },
    {
      keywords: ['เลือด', 'บาดเจ็บ', 'มีดบาด', 'เลือดออก', 'แผล'],
      element: 'ธาตุไฟ / ดาวอังคาร (๓)',
      luckyDigitsPrimary: ['7', '1', '9'],
      luckyDigitsSecondary: ['3', '4'],
      meaning: 'ฝันเห็นเลือดหรือได้แผล โบราณว่าคือการหลุดพ้นเคราะห์กรรม จะได้รับลาภก้อนโตทดแทนความเจ็บปวด สิ่งร้ายจะกลายเป็นโชคลาภมงคล',
      blessing: 'แนะนำบริจาคโลหิต หรือทำบุญซื้อเวชภัณฑ์รักษาโรค'
    },
    {
      keywords: ['ตัดผม', 'ตัดเล็บ', 'โกนผม', 'สระผม'],
      element: 'ธาตุลม / ดาวพุธ (๔)',
      luckyDigitsPrimary: ['3', '6', '1'],
      luckyDigitsSecondary: ['5', '7'],
      meaning: 'ฝันว่าตัดผมหรือตัดเล็บ สื่อถึงการขจัดมลทิน สิ่งอัปมงคลหมดไป โชคลาภเงินทองและความสดใสกำลังก้าวเข้ามาในชีวิต',
      blessing: 'แนะนำทำบุญกวาดลานวัด หรือบริจาคเสื้อผ้ามือสอง'
    },
    {
      keywords: ['ร้องไห้', 'น้ำตาไหล', 'เศร้าใจ', 'เสียใจ'],
      element: 'ธาตุน้ำ / ดาวจันทร์ (๒)',
      luckyDigitsPrimary: ['2', '4', '7'],
      luckyDigitsSecondary: ['6', '0'],
      meaning: 'ฝันว่าร้องไห้ โบราณว่าเป็นนิมิตกลับด้าน ความทุกข์จะระบายออกไป ความสุขและโชคลาภเงินทองจะหลั่งไหลเข้ามาแทนที่อย่างปาฏิหาริย์',
      blessing: 'แนะนำทำบุญช่วยเหลือผู้ยากไร้ หรือให้อภัยทาน'
    },
    {
      keywords: ['บินได้', 'เหาะ', 'ลอยฟ้า', 'ปีกงอก'],
      element: 'ธาตุลม / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['6', '9', '5'],
      luckyDigitsSecondary: ['1', '8'],
      meaning: 'ฝันว่าบินได้หรือเหาะขึ้นสู่ท้องฟ้า สื่อถึงความสำเร็จอันสูงส่ง การเลื่อนยศตำแหน่ง ความสุขสมหวัง และมีโชคลาภพุ่งทะยานดั่งใจนึก',
      blessing: 'แนะนำทำบุญสร้างโบสถ์ หรือถวายช่อฟ้าใบระกา'
    },
    {
      keywords: ['ตกเหว', 'ตกตึก', 'ตกที่สูง', 'สะดุ้งตื่น'],
      element: 'ธาตุลม / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['0', '4', '8'],
      luckyDigitsSecondary: ['3', '7'],
      meaning: 'ฝันว่าตกจากที่สูง สื่อถึงการผ่านพ้นวิกฤติต่ำสุด กำลังจะตั้งหลักได้ใหม่ และมีเกณฑ์ได้รับโชคลาภแบบไม่คาดฝันเพื่อกอบกู้สถานการณ์',
      blessing: 'แนะนำไหว้พระพรหม หรือสวดบทมหาจักรพรรดิ'
    },

    // 4. วัตถุ ทรัพย์สิน & สถานที่มงคล
    {
      keywords: ['แหวน', 'สร้อยคอ', 'เพชร', 'มรกต', 'อัญมณี', 'กำไล'],
      element: 'ธาตุทอง / ดาวศุกร์ (๖)',
      luckyDigitsPrimary: ['0', '6', '9'],
      luckyDigitsSecondary: ['1', '5'],
      meaning: 'ฝันเห็นหรือได้สวมแหวน เพชร หรืออัญมณี สื่อถึงเกียรติยศ วาสนาสูงส่ง จะได้รับข่าวดีเรื่องโชคลาภ และมีเกณฑ์ถูกสลาก N3 รางวัลใหญ่',
      blessing: 'แนะนำปิดทองลูกนิมิต หรือร่วมบูรณะพระประธาน'
    },
    {
      keywords: ['เสื้อผ้า', 'ชุดใหม่', 'รองเท้า', 'แต่งตัว', 'สวมเสื้อ'],
      element: 'ธาตุลม / ดาวศุกร์ (๖)',
      luckyDigitsPrimary: ['5', '6', '8'],
      luckyDigitsSecondary: ['2', '4'],
      meaning: 'ฝันว่าได้เสื้อผ้าใหม่หรือรองเท้าใหม่ สื่อถึงการเริ่มต้นชีวิตใหม่ มีการเปลี่ยนแปลงในทางที่ดี ได้รับโอกาสและโชคลาภจากการติดต่อสื่อสาร',
      blessing: 'แนะนำบริจาคเสื้อผ้าเครื่องนุ่งห่มแก่ผู้ประสบภัย'
    },
    {
      keywords: ['ศาลพระภูมิ', 'ศาลเจ้าที่', 'เจ้าแม่', 'พ่อปู่', 'เทวดา', 'ศาลตายาย'],
      element: 'ธาตุดิน / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['9', '8', '5'],
      luckyDigitsSecondary: ['6', '1'],
      meaning: 'ฝันเห็นศาลพระภูมิหรือสิ่งศักดิ์สิทธิ์ประจำบ้าน สื่อถึงการคุ้มครองรักษา ท่านกำลังเปิดทางนำโชคลาภและเลขเด็ดมาให้แก่เจ้าบ้านโดยตรง',
      blessing: 'แนะนำไหว้ศาลพระภูมิด้วยผลไม้ 5 อย่างและน้ำแดง'
    },
    {
      keywords: ['ต้นไม้', 'ดอกไม้', 'ป่าไม้', 'ต้นโพธิ์', 'ต้นตะเคียน', 'ดอกบัว'],
      element: 'ธาตุไม้ / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['5', '2', '8'],
      luckyDigitsSecondary: ['9', '3'],
      meaning: 'ฝันเห็นต้นไม้ใหญ่ ดอกบัว หรือดอกไม้บาน สื่อถึงความร่มเย็นเป็นสุข ทรัพย์สินงอกเงย มีเสน่ห์เมตตา และได้รับโชคลาภจากธรรมชาติ',
      blessing: 'แนะนำร่วมปลูกต้นไม้ในวัด หรือดูแลรักษาสิ่งแวดล้อม'
    },

    // 5. ปรากฏการณ์ธรรมชาติ & ดาราศาสตร์
    {
      keywords: ['ฟ้าผ่า', 'ฟ้าร้อง', 'พายุ', 'ลมแรง', 'ฝนตกหนัก'],
      element: 'ธาตุไฟ / ดาวอาทิตย์ (๑)',
      luckyDigitsPrimary: ['1', '9', '8'],
      luckyDigitsSecondary: ['4', '7'],
      meaning: 'ฝันเห็นฟ้าผ่าหรือพายุพัดแรง สื่อถึงการเปลี่ยนแปลงแบบสายฟ้าแลบ โชคลาภก้อนโตจะเข้ามาอย่างฉับพลันทันด่วนเกินความคาดหมาย',
      blessing: 'แนะนำถวายหลอดไฟ หรือบริจาคช่วยผู้ประสบวาตภัย'
    },
    {
      keywords: ['พระจันทร์', 'ดวงจันทร์', 'จันทร์เพ็ญ', 'คืนเดือนหงาย'],
      element: 'ธาตุน้ำ / ดาวจันทร์ (๒)',
      luckyDigitsPrimary: ['2', '8', '9'],
      luckyDigitsSecondary: ['6', '0'],
      meaning: 'ฝันเห็นพระจันทร์เต็มดวง สื่อถึงความอุดมสมบูรณ์ จิตใจผ่องใส มีผู้ใหญ่คอยอุปถัมภ์ค้ำชู และมีเกณฑ์ได้รับโชคลาภจากความเมตตา',
      blessing: 'แนะนำทำบุญตักบาตรเช้าในวันเพ็ญ หรือถวายเทียนหอม'
    },
    {
      keywords: ['ดวงอาทิตย์', 'พระอาทิตย์', 'แสงแดด', 'รุ่งอรุณ', 'สุริยคราส'],
      element: 'ธาตุไฟ / ดาวอาทิตย์ (๑)',
      luckyDigitsPrimary: ['1', '9', '0'],
      luckyDigitsSecondary: ['5', '8'],
      meaning: 'ฝันเห็นพระอาทิตย์ส่องแสงเจิดจ้า สื่อถึงชื่อเสียง เกียรติยศ อำนาจบารมี และความสว่างไสวในดวงชะตา มีโชคลาภโดดเด่นสมดั่งใจนึก',
      blessing: 'แนะนำถวายสังฆทานสว่างไสว เช่น หลอดไฟ หรือเทียนบูชา'
    },
    {
      keywords: ['ดาวตก', 'ผีพุ่งไต้', 'ดาวหาง', 'ดาวประกายพรึก', 'ท้องฟ้าเต็มไปด้วยดาว'],
      element: 'ธาตุลม / ดาวเกตุ (๙)',
      luckyDigitsPrimary: ['2', '9', '7'],
      luckyDigitsSecondary: ['1', '6'],
      meaning: 'ฝันเห็นดาวตกหรือผีพุ่งไต้ สื่อถึงคำอธิษฐานจะเป็นจริง สิ่งที่ตั้งใจไว้จะสำเร็จ และจะได้รับลาภลอยมงคลจากฟากฟ้าสวรรค์',
      blessing: 'แนะนำตั้งจิตอธิษฐานทำสมาธิ 5 นาทีและแผ่เมตตา'
    },

    // 6. เหตุการณ์ & สถานที่สาธารณะ
    {
      keywords: ['โรงพยาบาล', 'หมอ', 'พยาบาล', 'คนป่วย', 'ยา'],
      element: 'ธาตุดิน / ดาวเสาร์ (๗)',
      luckyDigitsPrimary: ['4', '7', '0'],
      luckyDigitsSecondary: ['2', '8'],
      meaning: 'ฝันเห็นโรงพยาบาลหรือคุณหมอ สื่อถึงการหมดทุกข์หมดโศก สุขภาพร่างกายจะฟื้นฟู และมีเกณฑ์ได้รับโชคลาภก้อนโตมาบรรเทาชีวิต',
      blessing: 'แนะนำบริจาคเงินสมทบทุนจัดซื้อเครื่องมือแพทย์'
    },
    {
      keywords: ['โรงเรียน', 'สอบ', 'หนังสือ', 'อาจารย์', 'ครู', 'ห้องเรียน'],
      element: 'ธาตุลม / ดาวพุธ (๔)',
      luckyDigitsPrimary: ['5', '4', '1'],
      luckyDigitsSecondary: ['9', '7'],
      meaning: 'ฝันเกี่ยวกับโรงเรียน การสอบ หรือหนังสือ สื่อถึงสติปัญญา ความรอบรู้ การตัดสินใจลงทุนที่เฉียบแหลม และจะได้รับผลตอบแทนงดงาม',
      blessing: 'แนะนำบริจาคหนังสือเรียน หรืออุปกรณ์การเรียนแก่นักเรียนยากไร้'
    },
    {
      keywords: ['อาหาร', 'กินข้าว', 'โต๊ะจีน', 'ผลไม้', 'ขนม', 'กินเลี้ยง'],
      element: 'ธาตุดิน / ดาวพฤหัสบดี (๕)',
      luckyDigitsPrimary: ['8', '9', '6'],
      luckyDigitsSecondary: ['2', '3'],
      meaning: 'ฝันว่าได้กินอาหารอร่อย หรือร่วมโต๊ะเลี้ยง สื่อถึงความอุดมสมบูรณ์ในครอบครัว จะมีโชคลาภและของฝากก้อนโตมามอบให้ถึงมือ',
      blessing: 'แนะนำทำบุญตั้งโรงทาน หรือถวายภัตตาหารเพลแด่พระสงฆ์'
    },
    {
      keywords: ['บันได', 'ขึ้นเขา', 'ปีนเขา', 'ที่สูง', 'ยอดเขา'],
      element: 'ธาตุไฟ / ดาวอาทิตย์ (๑)',
      luckyDigitsPrimary: ['9', '7', '1'],
      luckyDigitsSecondary: ['8', '5'],
      meaning: 'ฝันว่าเดินขึ้นบันไดหรือปีนขึ้นสู่ยอดเขา สื่อถึงชีวิตกำลังไต่เต้าสู่จุดสูงสุด ความเจริญก้าวหน้า และจะได้รับโชคลาภเพิ่มพูนทุกย่างก้าว',
      blessing: 'แนะนำทำบุญสร้างถนนเข้าวัด หรือสร้างบันไดขึ้นอุโบสถ'
    }
  ];

  // Safe fallback entry for unmapped dreams
  const defaultEntry = {
    keywords: ['สัญลักษณ์สวรรค์'],
    element: 'ธาตุจักรวาล / สุริยคราสมงคล',
    luckyDigitsPrimary: ['7', '8', '9'],
    luckyDigitsSecondary: ['3', '5'],
    meaning: 'ฝันของคุณเต็มไปด้วยสัญลักษณ์แห่งพลังจักรวาลและการหยั่งรู้ทางจิตวิญญาณ แม้คำในฝันจะซับซ้อน แต่พลังดาวโคจรดวงชะตากำลังเปิดรับโชคใหญ่ของ N3 ในงวดนี้',
    blessing: 'แนะนำตั้งจิตตั้งสมาธิ 1 นาที แล้วอธิษฐานเบื้องหน้าพระประธาน'
  };

  /**
   * สกัดตัวเลขโดยตรงจากข้อความฝัน (Contextual Explicit Number Extractor)
   * ตรวจจับทั้งจำนวนตัว/สิ่งของ (เช่น "งู 2 ตัว") และตัวเลขโดด 2-4 หลัก (เช่น "ทะเบียน 954", "เลข 42")
   */
  function extractExplicitNumbers(text) {
    if (!text) return { found: false, countDigits: [], rawNumbers: [], anchorDirect: null, anchorTwo: null };

    // แปลงเลขไทย ๐-๙ เป็นเลขอารบิก 0-9 เพื่อรองรับทั้งสองระบบ
    const normalizedText = text.replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d)));

    const thaiNumberWords = {
      'หนึ่ง': '1', 'เดียว': '1', 'สอง': '2', 'คู่': '2', 'สาม': '3',
      'สี่': '4', 'ห้า': '5', 'หก': '6', 'เจ็ด': '7', 'แปด': '8',
      'เก้า': '9', 'สิบ': '0'
    };

    const countDigits = [];
    const rawNumbers = [];

    // 1. ตรวจจับจำนวน เช่น "2 ตัว", "3 ใบ", "5 คน", "สองตัว"
    const countRegex = /(\d+|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ)\s*(?:ตัว|คน|ใบ|อัน|ชิ้น|หลัง|คัน|องค์|รูป|คู่|แห่ง)/g;
    let match;
    while ((match = countRegex.exec(normalizedText)) !== null) {
      const val = match[1];
      if (thaiNumberWords[val]) {
        countDigits.push(thaiNumberWords[val]);
      } else if (/^\d+$/.test(val)) {
        countDigits.push(val.slice(-1)); // เอาเลขท้าย 1 หลัก
      }
    }

    // 2. ตรวจจับตัวเลขชัดเจน 2-4 หลัก เช่น "ทะเบียน 954", "เลข 42", "999"
    const explicitRegex = /(?:ทะเบียน|เลข|เบอร์|งวด|อายุ|พ\.?ศ\.?|บ้านเลขที่|ห้อง|ชั้น|เบอร์โทร)?\s*([0-9]{2,4})/g;
    while ((match = explicitRegex.exec(normalizedText)) !== null) {
      const numStr = match[1];
      if (numStr && numStr.length >= 2) {
        rawNumbers.push(numStr);
      }
    }

    let anchorDirect = null;
    let anchorTwo = null;

    if (rawNumbers.length > 0) {
      // ให้ลำดับความสำคัญเลข 3 ตัวตรงก่อนเลข 2 ตัว (เช่น "ฝันเห็น 25 ทะเบียน 954" -> 954 เป็น anchorDirect)
      const threeDigitNum = rawNumbers.find(n => n.length === 3);
      const fourPlusNum = rawNumbers.find(n => n.length >= 4);
      const twoDigitNum = rawNumbers.find(n => n.length === 2);

      if (threeDigitNum) {
        anchorDirect = threeDigitNum;
        anchorTwo = twoDigitNum || threeDigitNum.slice(-2);
      } else if (fourPlusNum) {
        anchorDirect = fourPlusNum.slice(-3);
        anchorTwo = twoDigitNum || fourPlusNum.slice(-2);
      } else if (twoDigitNum) {
        anchorTwo = twoDigitNum;
      }
    }

    return {
      found: countDigits.length > 0 || rawNumbers.length > 0,
      countDigits,
      rawNumbers,
      anchorDirect,
      anchorTwo
    };
  }

  /**
   * Tokenizes user dream input text and matches against dictionary
   */
  function analyzeDreamText(text) {
    if (!text || text.trim().length === 0) {
      return { matched: [defaultEntry], rawText: '', explicit: extractExplicitNumbers('') };
    }

    const cleanText = text.trim();
    const matchedEntries = [];

    dreamDictionary.forEach(entry => {
      const hasMatch = entry.keywords.some(kw => cleanText.includes(kw));
      if (hasMatch) {
        matchedEntries.push(entry);
      }
    });

    if (matchedEntries.length === 0) {
      matchedEntries.push(defaultEntry);
    }

    const explicit = extractExplicitNumbers(cleanText);

    return {
      matched: matchedEntries,
      rawText: cleanText,
      explicit
    };
  }

  /**
   * Deterministic yet dynamic hash function based on dream text & current date
   */
  function hashString(str) {
    let hash = 0;
    const today = new Date();
    const fullStr = str + '-' + today.getDate() + '-' + today.getMonth() + '-' + today.getFullYear();
    for (let i = 0; i < fullStr.length; i++) {
      const char = fullStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Generates full N3 lucky numbers & predictions based on dream input
   */
  function generatePrediction(dreamInput) {
    const analysis = analyzeDreamText(dreamInput);
    const primaryMatch = analysis.matched[0] || defaultEntry;
    const seed = hashString(analysis.rawText || 'magic-dream');
    const explicit = analysis.explicit;

    // Combine digits pool safely
    let pool = [];
    analysis.matched.forEach(m => {
      if (m && m.luckyDigitsPrimary && m.luckyDigitsSecondary) {
        pool.push(...m.luckyDigitsPrimary, ...m.luckyDigitsSecondary);
      }
    });
    if (pool.length < 5) pool.push('9', '8', '5', '3', '1');

    let n3Direct = '';
    let n2Digit = '';

    // กรณีมีเลขระบุชัดเจนในความฝัน (Explicit Numbers Found)
    if (explicit.anchorDirect) {
      n3Direct = explicit.anchorDirect;
      n2Digit = explicit.anchorTwo || n3Direct.slice(-2);
    } else if (explicit.anchorTwo) {
      const headDigit = pool[seed % pool.length] || '9';
      n3Direct = `${headDigit}${explicit.anchorTwo}`;
      n2Digit = explicit.anchorTwo;
    } else if (explicit.countDigits.length > 0) {
      // นำเลขจำนวนตัวที่นับได้มาเป็นตัวเด่นหลัก
      const countDigit = explicit.countDigits[0];
      const d2 = pool[(seed + 3) % pool.length] || '8';
      const d3 = pool[(seed + 7) % pool.length] || '9';
      n3Direct = `${countDigit}${d2}${d3}`;
      n2Digit = `${d2}${d3}`;
    } else {
      // สังเคราะห์ตามหลักโหราศาสตร์ตัวเลข
      const d1 = pool[seed % pool.length] || '7';
      const d2 = pool[(seed + 3) % pool.length] || '8';
      const d3 = pool[(seed + 7) % pool.length] || '9';
      n3Direct = `${d1}${d2}${d3}`;
      n2Digit = `${d2}${d3}`;
    }

    // สร้างชุดเลขโต๊ด (สลับหลัก) ทั้งหมดที่ไม่ซ้ำกับ 3 ตัวตรง
    const dArr = n3Direct.split('');
    const permutations = [
      `${dArr[0]}${dArr[2]}${dArr[1]}`,
      `${dArr[1]}${dArr[0]}${dArr[2]}`,
      `${dArr[1]}${dArr[2]}${dArr[0]}`,
      `${dArr[2]}${dArr[0]}${dArr[1]}`,
      `${dArr[2]}${dArr[1]}${dArr[0]}`
    ].filter((v, i, a) => a.indexOf(v) === i && v !== n3Direct);

    const n3Tod = permutations.length > 0 ? permutations.slice(0, 3).join(', ') : 'ไม่มี (เลขตอง)';
    const allTods = permutations; // รายการโต๊ดทั้งหมดสำหรับทำแพ็กเกจ

    // Calculate Confidence percentage (94.0% - 99.8%)
    const confidence = ((seed % 58) / 10 + 94.0).toFixed(1);

    // Combine all descriptions if multiple keywords matched
    let combinedMeaning = primaryMatch.meaning || defaultEntry.meaning;
    if (explicit.found) {
      if (explicit.rawNumbers.length > 0) {
        combinedMeaning += ` (นิมิตเด่นปรากฏเลขมงคล "${explicit.rawNumbers.join(', ')}" ชัดเจน AI จึงนำมาเป็นแกนหลัก)`;
      } else if (explicit.countDigits.length > 0) {
        combinedMeaning += ` (นิมิตเด่นปรากฏจำนวน ${explicit.countDigits.join(', ')} ชัดเจน AI จึงนำมาผูกเป็นเลขหัวมงคล)`;
      }
    } else if (analysis.matched.length > 1) {
      combinedMeaning += ' นอกจากนี้สัญลักษณ์เสริมยังชี้ถือกำเนิดพละกำลังมหาศาล สอดรับกับชุดตัวเลขเด่นของ N3';
    }

    // Safe extraction of matched symbols string
    const symbolsStr = analysis.matched
      .map(m => (m && m.keywords && m.keywords.length > 0 ? m.keywords[0] : 'สัญลักษณ์มงคล'))
      .join(', ');

    // Generate Astrological 4-Line Thai Rhyme / Blessing Poem
    const poem = generateAstroPoem(primaryMatch, n3Direct, symbolsStr);

    return {
      dreamText: analysis.rawText || 'ความฝันมงคลสวรรค์',
      element: primaryMatch.element || defaultEntry.element,
      n3Direct: n3Direct,
      n3Tod: n3Tod,
      allTods: allTods,
      n2Digit: n2Digit,
      confidence: `${confidence}%`,
      meaning: combinedMeaning,
      blessing: primaryMatch.blessing || defaultEntry.blessing,
      matchedSymbols: symbolsStr,
      poem: poem,
      explicitFound: explicit.found
    };
  }

  /**
   * Generates bespoke 4-line Thai auspicious astrology poem
   */
  function generateAstroPoem(match, n3Num, symbol) {
    const p1 = `นิมิตฝันแห่งโชคลาภพาพบสุข`;
    const p2 = `สิ่งศักดิ์สิทธิ์ปลดเปลื้องทุกข์ดับตัณหา`;
    const p3 = `เลขมงคล ${n3Num} เด่นในสายตา`;
    const p4 = `รับทรัพย์ใหญ่สลาก N3 สมดั่งใจ`;
    return `${p1} / ${p2}\n${p3} / ${p4}`;
  }

  return {
    analyzeDreamText,
    extractExplicitNumbers,
    generatePrediction,
    dreamDictionary
  };
})();

// Support Node.js CommonJS export for bot-service integration
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIDreamEngine;
}
