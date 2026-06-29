require('dotenv').config();
const mongoose = require('mongoose');
const Contractor = require('../src/models/Contractor');

const VENDORS = [
  { vendorCode: 'VC-0001', companyName: 'Shri Banke Bihari Construction', ownerName: 'Lokendra Singh' },
  { vendorCode: 'VC-0002', companyName: 'Ambika Construction', ownerName: 'Chhaviram Mahor' },
  { vendorCode: 'VC-0003', companyName: 'Ravi Kushwah', ownerName: 'Ravi Kushwah' },
  { vendorCode: 'VC-0004', companyName: 'Shriram Associates', ownerName: 'Dharmendra Kumar Jatav' },
  { vendorCode: 'VC-0005', companyName: 'Nemichand Sagar', ownerName: 'Nemichand Sagar' },
  { vendorCode: 'VC-0006', companyName: 'Rajesh Plumber', ownerName: 'Rajesh Kushwaha' },
  { vendorCode: 'VC-0007', companyName: 'Ullash Jha', ownerName: 'Ullash Jha' },
  { vendorCode: 'VC-0008', companyName: 'Shyamsundar Road Work', ownerName: 'Shyamsundar Maurya' },
  { vendorCode: 'VC-0009', companyName: 'Kiran Bhadauriya', ownerName: 'Kiran Bhadauriya' },
  { vendorCode: 'VC-0010', companyName: 'C.P. Solar Energy', ownerName: 'Arjun Mandelia' },
  { vendorCode: 'VC-0011', companyName: 'Prakash Ceiling Work', ownerName: 'Prakash Singh Sisodiya' },
  { vendorCode: 'VC-0012', companyName: 'Airsource Services', ownerName: 'Rakesh Sonava / Ravi Bajpai' },
  { vendorCode: 'VC-0013', companyName: 'Firoz Khan', ownerName: 'Firoz Khan' },
  { vendorCode: 'VC-0014', companyName: 'Ekta Concrete Solution', ownerName: 'Pancham' },
  { vendorCode: 'VC-0015', companyName: 'Paras Nath', ownerName: 'Paras Nath' },
  { vendorCode: 'VC-0016', companyName: 'Ravindra Kumar Kushwah', ownerName: 'Ravindra Kumar Kushwah' },
  { vendorCode: 'VC-0017', companyName: 'Tyagi Construction', ownerName: 'Gyanendra Tyagi' },
  { vendorCode: 'VC-0018', companyName: 'Naval Giri Goswami', ownerName: 'Naval Giri Goswami' },
  { vendorCode: 'VC-0019', companyName: 'Abdul Ahashad', ownerName: 'Abdul Ahshad' },
  { vendorCode: 'VC-0020', companyName: 'Yatendra Singh', ownerName: 'Yatendra Singh' },
  { vendorCode: 'VC-0021', companyName: 'Kumar Developers', ownerName: 'Satish Kumar' },
  { vendorCode: 'VC-0022', companyName: 'Dharamjit', ownerName: 'Dharamjit' },
  { vendorCode: 'VC-0023', companyName: 'Pooran Singh Kushwah', ownerName: 'Pooran Singh Kushwah' },
  { vendorCode: 'VC-0024', companyName: 'Sanjay Goyal (Mashi Construction and Contractor)', ownerName: 'Sanjay Goyal' },
  { vendorCode: 'VC-0025', companyName: 'Shubhankar Ceremics and Marbles', ownerName: 'Aakash Kaushik' },
  { vendorCode: 'VC-0026', companyName: 'Girraj Prajapati', ownerName: 'Girraj' },
  { vendorCode: 'VC-0027', companyName: 'Gaurav Bricks', ownerName: 'Gaurav Jethwani' },
  { vendorCode: 'VC-0028', companyName: 'Ganpat Soil Work', ownerName: 'Ganpat Prajapati' },
  { vendorCode: 'VC-0029', companyName: 'Prashant Singh', ownerName: 'Prashant Singh' },
  { vendorCode: 'VC-0030', companyName: 'New Yadav Crane', ownerName: 'Suman Yadav' },
  { vendorCode: 'VC-0031', companyName: "Siddiqui and Son's", ownerName: 'Halimuddin Siddiqui' },
  { vendorCode: 'VC-0032', companyName: 'Maa Durga Construction', ownerName: 'Sanjay Sahni' },
  { vendorCode: 'VC-0033', companyName: 'Jai Bharat Industries', ownerName: 'Savita Jethwani' },
  { vendorCode: 'VC-0034', companyName: 'Prabhat Industries', ownerName: 'Renu Jethwani' },
  { vendorCode: 'VC-0035', companyName: 'Chetan Pandey', ownerName: 'Chetan Pandey' },
  { vendorCode: 'VC-0036', companyName: 'Virendra Jatav', ownerName: 'Virendra Jatav' },
  { vendorCode: 'VC-0037', companyName: 'Asphak Welding', ownerName: 'Asphak' },
  { vendorCode: 'VC-0038', companyName: 'Mukhtar Khan', ownerName: 'Mukhtar Khan' },
  { vendorCode: 'VC-0039', companyName: 'Brijesh Babu', ownerName: 'Brijesh Babu Dohare' },
  { vendorCode: 'VC-0040', companyName: 'Beer Singh', ownerName: 'Beer Singh' },
  { vendorCode: 'VC-0041', companyName: 'Deni Singh', ownerName: 'Deni Singh' },
  { vendorCode: 'VC-0042', companyName: 'Mukesh Singh', ownerName: 'Mukesh Singh' },
  { vendorCode: 'VC-0043', companyName: 'Hiralal Kushwah', ownerName: 'Hiralal Kushwah' },
  { vendorCode: 'VC-0044', companyName: 'Naaz Furnitures', ownerName: 'Nazim Ali' },
  { vendorCode: 'VC-0045', companyName: 'Shri Girraj Fire Solutions', ownerName: 'Jitendra Kumar' },
  { vendorCode: 'VC-0046', companyName: 'Sankalp Verma', ownerName: 'Brijesh Verma' },
  { vendorCode: 'VC-0047', companyName: 'Shri Girraj Fire Solutions', ownerName: 'Jitendra Kumar' },
  { vendorCode: 'VC-0048', companyName: 'MK Construction', ownerName: 'Mukesh Kumar Kushwah' },
  { vendorCode: 'VC-0049', companyName: 'Hindustan Nursery', ownerName: 'Bablu Kushwah' },
  { vendorCode: 'VC-0050', companyName: 'Akash Jatav', ownerName: 'Akash Jatav' },
  { vendorCode: 'VC-0051', companyName: 'Om Sai Consultants', ownerName: 'Sushil Kumar Shrivastava' },
  { vendorCode: 'VC-0052', companyName: 'Vipin Goyal', ownerName: 'Vipin Goyal' },
  { vendorCode: 'VC-0053', companyName: 'Shri Balaji Enterprises', ownerName: 'Pawan Nahar' },
  { vendorCode: 'VC-0054', companyName: 'Motiram Mahore', ownerName: 'Motiram Mahore' },
  { vendorCode: 'VC-0055', companyName: 'Ashok Singh Kushwah', ownerName: 'Ashok Singh Kushwah' },
  { vendorCode: 'VC-0056', companyName: 'Yogendra Pop', ownerName: 'Yogendra Singh' },
  { vendorCode: 'VC-0057', companyName: 'G.A. Construction', ownerName: 'Ullash Jha' },
  { vendorCode: 'VC-0058', companyName: 'Sai Home Decor', ownerName: 'Mahesh Chandwani' },
  { vendorCode: 'VC-0059', companyName: 'Amit Gupta', ownerName: 'Vipin Goyal' },
  { vendorCode: 'VC-0060', companyName: 'Galav Aluminium', ownerName: 'Rohit Agarwal' },
  { vendorCode: 'VC-0061', companyName: 'Mohan Sharma Choti', ownerName: 'Mohan Sharma Choti' },
  { vendorCode: 'VC-0062', companyName: 'Yogendra Singh Bhadoria', ownerName: 'Yogendra Singh Bhadoria' },
  { vendorCode: 'VC-0063', companyName: 'NS Construction and Contractor', ownerName: 'Sanjay' },
  { vendorCode: 'VC-0064', companyName: 'Mohar Singh', ownerName: 'Mohar Singh' },
  { vendorCode: 'VC-0065', companyName: 'Decore Line', ownerName: 'Alim Siddiqui' },
  { vendorCode: 'VC-0066', companyName: 'Balkrishna Ojha', ownerName: 'Balkrishna Ojha' },
  { vendorCode: 'VC-0067', companyName: 'Narendra Singh Uchchadiya', ownerName: 'Narendra Singh' },
  { vendorCode: 'VC-0068', companyName: 'Sunil Goyal', ownerName: 'Sunil Goyal' },
  { vendorCode: 'VC-0069', companyName: 'Ahsan Khan', ownerName: 'Ahsan Khan' },
  { vendorCode: 'VC-0070', companyName: 'Sanjay Kushwah', ownerName: 'Sanjay Kushwah' },
  { vendorCode: 'VC-0071', companyName: 'Kavita Kushwah', ownerName: 'Kavita Kushwah' },
  { vendorCode: 'VC-0072', companyName: 'Arvind Puri', ownerName: 'Arvind Puri' },
  { vendorCode: 'VC-0073', companyName: 'Ranjeet Kumar Jatav', ownerName: 'Ranjeet Kumar Jatav' },
  { vendorCode: 'VC-0074', companyName: 'Seema Core Cut', ownerName: 'Seema' },
  { vendorCode: 'VC-0075', companyName: 'Mukesh Kansana', ownerName: 'Mukesh Kansana' },
  { vendorCode: 'VC-0076', companyName: 'Omprakash Jha', ownerName: 'Omprakash Jha' },
  { vendorCode: 'VC-0077', companyName: 'Mahesh Gurjar', ownerName: 'Mahesh Gurjar' },
  { vendorCode: 'VC-0078', companyName: 'Parvej', ownerName: 'Parvej' },
  { vendorCode: 'VC-0079', companyName: 'Manoj Agrawal', ownerName: 'Manoj Agrawal' },
  { vendorCode: 'VC-0080', companyName: 'Parvej', ownerName: 'Parvej' },
  { vendorCode: 'VC-0081', companyName: 'Ambika Construction', ownerName: 'Banwari Mahor' },
  { vendorCode: 'VC-0082', companyName: 'Rakesh Sikarwar', ownerName: 'Rakesh Sikarwar' },
  { vendorCode: 'VC-0083', companyName: 'Jitendra Singh (Shri Banke Bihari Construction)', ownerName: 'Jitendra Singh (Lokendra Singh)' },
  { vendorCode: 'VC-0084', companyName: 'Niket Jain', ownerName: 'Niket Jain' },
  { vendorCode: 'VC-0085', companyName: 'Manish Kumar Jain', ownerName: 'Manish Kumar Jain' },
  { vendorCode: 'VC-0086', companyName: 'Lokesh Singh', ownerName: 'Lokesh Singh' },
  { vendorCode: 'VC-0087', companyName: 'Niket Homes', ownerName: 'Niket' },
  { vendorCode: 'VC-0088', companyName: 'Raheem Khan', ownerName: 'Raheem Khan' },
  { vendorCode: 'VC-0089', companyName: 'Devendra Dhakar', ownerName: 'Devendra Dhakar' },
  { vendorCode: 'VC-0090', companyName: 'Badam Singh', ownerName: 'Badam Singh' },
  { vendorCode: 'VC-0091', companyName: 'Vardaanya Windoors', ownerName: 'Vaibhav Gupta' },
  { vendorCode: 'VC-0092', companyName: 'Ambika Glass and Hardware', ownerName: 'Kshitiz Garg' },
  { vendorCode: 'VC-0093', companyName: 'Dulari Devi', ownerName: 'Dulari Devi' },
  { vendorCode: 'VC-0094', companyName: 'Kamal Singh', ownerName: 'Kamal Singh' },
  { vendorCode: 'VC-0095', companyName: 'Shiva Pest Control India', ownerName: 'Birjesh Babu Dohare' },
  { vendorCode: 'VC-0096', companyName: 'Neha Agarwal', ownerName: 'Yogesh Agarwal' },
  { vendorCode: 'VC-0097', companyName: 'Gungun Enterprises', ownerName: 'Balkrishna' },
  { vendorCode: 'VC-0098', companyName: 'Nikhil Prajapati', ownerName: 'Nikhil Prajapati' },
  { vendorCode: 'VC-0099', companyName: 'Rajni Verma', ownerName: 'Rajni Verma' },
  { vendorCode: 'VC-0100', companyName: 'Krish Aluminium', ownerName: 'Krish Aluminium' },
  { vendorCode: 'VC-0101', companyName: 'Raghavendra Sikarwar', ownerName: 'Raghavendra Sikarwar' },
  { vendorCode: 'VC-0102', companyName: 'Anchal Gupta', ownerName: 'Anchal Gupta' },
  { vendorCode: 'VC-0103', companyName: 'Akshara Garg', ownerName: 'Kshitiz Garg' },
  { vendorCode: 'VC-0104', companyName: 'Shivraj Dhakad', ownerName: 'Shivraj Dhakad' },
  { vendorCode: 'VC-0105', companyName: 'Mahesh Kushwah', ownerName: 'Mahesh Kushwah' },
  { vendorCode: 'VC-0106', companyName: 'Sachin Jatav', ownerName: 'Sachin Jatav' },
  { vendorCode: 'VC-0107', companyName: 'Pathak Water Supplier', ownerName: 'Rajendra Pathak' },
  { vendorCode: 'VC-0108', companyName: 'Sourabh Kumar Singh', ownerName: 'Sourabh Kumar Singh' },
  { vendorCode: 'VC-0109', companyName: 'Neeraj Kumar Goyal', ownerName: 'Neeraj Kumar Goyal' },
  { vendorCode: 'VC-0110', companyName: 'Rajveer Singh Jaat', ownerName: 'Rajveer Singh Jaat' },
  { vendorCode: 'VC-0111', companyName: 'Anguri Devi', ownerName: 'Anguri Devi' },
  { vendorCode: 'VC-0112', companyName: 'Ramesh Chandra Prajapati', ownerName: 'Ramesh Chandra Prajapati' },
  { vendorCode: 'VC-0113', companyName: 'Lambardar Earth Movers', ownerName: 'Suraj Singh Kushwah' },
  { vendorCode: 'VC-0114', companyName: 'Kundan Singh Ghamar', ownerName: 'Kundan Singh Ghamar' },
  { vendorCode: 'VC-0115', companyName: 'Faizan Khan', ownerName: 'Faizan Khan' },
  { vendorCode: 'VC-0116', companyName: 'Rahul Kain', ownerName: 'Rahul Kain' },
  { vendorCode: 'VC-0117', companyName: 'Well Home Decor Studio Pvt Ltd', ownerName: 'Rajkumar Gupta' },
  { vendorCode: 'VC-0118', companyName: 'Wellhome Decor Studio Pvt Ltd', ownerName: 'Rajkumar Gupta' },
  { vendorCode: 'VC-0119', companyName: 'Bhupendra Singh', ownerName: 'Bhupendra Singh' },
  { vendorCode: 'VC-0120', companyName: 'Dinesh Mahor', ownerName: 'Dinesh Mahor' },
  { vendorCode: 'VC-0121', companyName: 'Lotan Singh', ownerName: 'Lotan Singh' },
  { vendorCode: 'VC-0122', companyName: 'MS Tensile Structure', ownerName: 'Shama Parveen' },
  { vendorCode: 'VC-0123', companyName: 'Suraj Giri', ownerName: 'Suraj Giri' },
  { vendorCode: 'VC-0124', companyName: 'Maheshwari Electrical Contractor', ownerName: 'Rajeev Maheshwari' },
  { vendorCode: 'VC-0125', companyName: 'Ambikeshwar', ownerName: 'Ambikeshwar' },
  { vendorCode: 'VC-0126', companyName: 'Arjun Singh Mahor', ownerName: 'Arjun Singh Mahor' },
  { vendorCode: 'VC-0127', companyName: 'Design Touch', ownerName: 'Vikram Khatri / Aarusi Khatri' },
  { vendorCode: 'VC-0128', companyName: 'Fusion Furnish India Private Limited', ownerName: 'Akhil Kadyan' },
  { vendorCode: 'VC-0129', companyName: 'Rajoriya Group Construction and Building Material Suppliers', ownerName: 'Vivek Rajoriya' },
  { vendorCode: 'VC-0130', companyName: 'Star Stone Machinery', ownerName: 'Ashu Vats' },
  { vendorCode: 'VC-0131', companyName: 'RK Constructions', ownerName: 'Sanjay Kushwah' },
  { vendorCode: 'VC-0132', companyName: 'Nand Kishor Mahor', ownerName: 'Nand Kishor Mahor' },
  { vendorCode: 'VC-0133', companyName: 'Mangal', ownerName: 'Mangal' },
  { vendorCode: 'VC-0134', companyName: 'Shivraj Dhakad', ownerName: 'Shivraj Dhakad' },
  { vendorCode: 'VC-0135', companyName: 'MS Tensile', ownerName: 'Shama Parveen' },
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  let updated = 0, created = 0, skipped = 0;

  for (const v of VENDORS) {
    const existing = await Contractor.findOne({ vendorCode: v.vendorCode });

    if (existing) {
      await Contractor.updateOne(
        { vendorCode: v.vendorCode },
        { $set: { companyName: v.companyName, ownerName: v.ownerName } }
      );
      console.log(`UPDATED  ${v.vendorCode} → ${v.companyName}`);
      updated++;
    } else {
      // Create with placeholder mobile (required field); can be updated later in the UI
      await Contractor.create({
        vendorCode: v.vendorCode,
        companyName: v.companyName,
        ownerName: v.ownerName,
        mobile: '0000000000',
      });
      console.log(`CREATED  ${v.vendorCode} → ${v.companyName}`);
      created++;
    }
  }

  console.log(`\nDone — Updated: ${updated} | Created: ${created} | Skipped: ${skipped}`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
