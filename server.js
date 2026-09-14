const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send("✅ Fantasy3D资产商店后端已经正常启动！");
});

app.listen(port, () => {
  console.log(`服务运行在端口 ${port}`);
})
